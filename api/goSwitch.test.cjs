const assert = require('node:assert/strict');
const { test } = require('node:test');

const api = import('./goSwitch.ts');
const origin = 'https://go-sw-001.local:8443';
const token = 'device_credential-ex-001';
const device = { device_id: 'GO-SW-001', model: 'GO-SWITCH-1CH', firmware: '1.0.0', status: 'online' };

test('uses canonical HTTPS addresses and rejects URLs with credentials or paths', async () => {
  const { normalizeGoSwitchOrigin, createGoSwitchClient } = await api;
  assert.equal(normalizeGoSwitchOrigin('https://GO-SW-001.local.:443/'), 'https://go-sw-001.local');
  assert.equal(normalizeGoSwitchOrigin('https://192.168.4.1:8443'), 'https://192.168.4.1:8443');
  for (const input of [
    'http://go-sw-001.local', 'https://user:secret@go-sw-001.local',
    'https://go-sw-001.local?token=secret', 'https://go-sw-001.local#secret',
    'https://go-sw-001.local/api/v1', 'https://go-sw-001.local:0',
    'https://go-sw-001.local:65536', 'https://go-sw-001.local\n',
    'https://192.168.04.1', 'https://192.168.4.256',
  ]) {
    assert.throws(() => normalizeGoSwitchOrigin(input), /HTTPS/);
  }
  assert.throws(() => createGoSwitchClient(origin, 'bad\r\nvalue'), /invalid pairing credentials/);
});

test('authenticates device, relay and network requests using the header', async (t) => {
  const { createGoSwitchClient } = await api;
  const network = { connected: true, ssid: 'Home network', ip: '192.168.4.1' };
  const calls = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers['Cache-Control'], 'no-cache, no-store');
    const response = {
      [`GET ${origin}/api/v1/device`]: { ...device, ignored: true },
      [`GET ${origin}/api/v1/relay`]: { state: 'off' },
      [`PUT ${origin}/api/v1/relay`]: { success: true, relay: { state: 'on' } },
      [`GET ${origin}/api/v1/network`]: network,
    }[`${options.method} ${url}`];
    assert.ok(response, 'Unexpected device request');
    if (options.method === 'PUT') {
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { state: 'on' });
    } else {
      assert.equal(options.body, undefined);
    }
    return Response.json(response);
  });
  const client = createGoSwitchClient(origin, token);
  assert.deepEqual(await client.getDevice(), device);
  assert.deepEqual(await client.getRelay(), { state: 'off' });
  assert.deepEqual(await client.setRelay('on'), { state: 'on' });
  assert.deepEqual(await client.getNetwork(), network);
  await assert.rejects(client.setRelay('unknown'), /valid relay state/);
  assert.equal(calls.mock.callCount(), 4);
});

test('allows the app to provide a fetch transport that rejects native redirects', async (t) => {
  const { createGoSwitchClient } = await api;
  const nativeFetch = t.mock.fn(async (url, options) => {
    assert.equal(url, `${origin}/api/v1/device`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return Response.json(device);
  });
  const client = createGoSwitchClient(origin, token, nativeFetch);
  assert.deepEqual(await client.getDevice(), device);
  assert.equal(nativeFetch.mock.callCount(), 1);
});

test('rejects invalid device responses, failed authorization, and redirected responses', async (t) => {
  const { createGoSwitchClient, GoSwitchHttpError } = await api;
  let response;
  t.mock.method(globalThis, 'fetch', async () => response);
  const client = createGoSwitchClient(origin, token);

  response = Response.json({ ...device, device_id: 'bad id' });
  await assert.rejects(client.getDevice(), /invalid device information/);
  response = Response.json({ state: true });
  await assert.rejects(client.getRelay(), /invalid relay state/);
  response = Response.json({ success: false, relay: { state: 'on' } });
  await assert.rejects(client.setRelay('on'), /did not confirm/);
  response = Response.json({ connected: 'yes' });
  await assert.rejects(client.getNetwork(), /invalid network status/);
  response = new Response('Invalid JSON');
  await assert.rejects(client.getNetwork(), /valid JSON/);
  response = new Response(token, { status: 401 });
  await assert.rejects(client.getRelay(), (error) =>
    error instanceof GoSwitchHttpError && error.status === 401 && !String(error).includes(token));
  response = { ok: true, url: 'https://different.local/api/v1/relay', json: () => ({ state: 'on' }) };
  await assert.rejects(client.getRelay(), /redirected/);
});

test('cancels pending and already-aborted requests', async (t) => {
  const { createGoSwitchClient } = await api;
  const controller = new AbortController();
  let fetchSignal;
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url, options) => {
    fetchSignal = options.signal;
    return new Promise(() => {});
  });
  const client = createGoSwitchClient(origin, token);
  const pending = client.getRelay(controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(client.getRelay(controller.signal), /cancelled/);
  assert.equal(fetchSignal.aborted, true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('authenticates WebSocket handshakes and only delivers relay 1 state events', async () => {
  const { createGoSwitchClient } = await api;
  const client = createGoSwitchClient(origin, token);
  const socket = { onopen: null, onmessage: null, onerror: null, onclose: null, close() { closeCount++; } };
  const events = [];
  let closeCount = 0;
  let connects = 0;
  let disconnects = 0;
  const unsubscribe = client.subscribe((url, headers) => {
    assert.equal(url, 'wss://go-sw-001.local:8443/api/v1/events');
    assert.deepEqual(headers, { Authorization: `Bearer ${token}` });
    return socket;
  }, (event) => events.push(event), () => { disconnects++; }, () => { connects++; });

  socket.onopen();
  const stateChange = { event: 'relay.state_changed', relay: 1, state: 'on' };
  socket.onmessage({ data: 'not JSON' });
  socket.onmessage({ data: JSON.stringify({ ...stateChange, relay: 2 }) });
  socket.onmessage({ data: JSON.stringify({ ...stateChange, state: 1 }) });
  socket.onmessage({ data: JSON.stringify({ ...stateChange, ignored: true }) });
  assert.deepEqual(events, [stateChange]);
  assert.equal(connects, 1);
  socket.onerror();
  unsubscribe();
  assert.equal(closeCount, 1);
  assert.equal(disconnects, 1);
  assert.equal(socket.onmessage, null);
});
