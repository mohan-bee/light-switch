const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const client = import('./esp.ts');
const status = { protocol: 'light-switch/v1', id: 'esp-01', name: 'Living room', on: false };
const jsonResponse = (body) => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json' },
});

test('normalizes private IPv4 and mDNS origins, including valid ports', async () => {
  const { normalizeAddress, DEFAULT_ADDRESSES } = await client;
  assert.equal(normalizeAddress(' 192.168.4.1 '), 'http://192.168.4.1');
  assert.equal(normalizeAddress('http://Light.local:8080/'), 'http://light.local:8080');
  assert.equal(normalizeAddress('10.0.0.1:80'), 'http://10.0.0.1');
  for (const input of ['172.16.0.1', '172.31.255.255', '10.255.255.255', 'bedroom.esp.local']) {
    assert.match(normalizeAddress(input), /^http:\/\//);
  }
  assert.deepEqual(DEFAULT_ADDRESSES, ['http://192.168.4.1', 'http://light.local']);
});

test('rejects public hosts, invalid IPs, credentials, paths, queries, and invalid ports', async () => {
  const { normalizeAddress } = await client;
  for (const input of ['', 'example.com', '127.0.0.1', '169.254.1.1', '172.15.0.1',
    '172.32.0.1', '8.8.8.8', '192.168.1.256', '192.168.1', '192.168.01.1',
    'https://192.168.4.1', 'http://user:password@light.local', 'light.local/api/status',
    'light.local?x=1', 'light.local#x', 'light.local:0', 'light.local:65536',
    '.local', 'bad..local', '-bad.local', 'bad-.local', 'light.local.evil.com']) {
    assert.throws(() => normalizeAddress(input), Error, input);
  }
});

test('requests and validates device status without following redirects', async () => {
  const { getStatus } = await client;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://192.168.4.1/api/status');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return jsonResponse({ ...status, ignored: 'discarded' });
  };
  assert.deepEqual(await getStatus('192.168.4.1'), status);
});

test('writes the requested state and verifies device identity', async () => {
  const { setLight } = await client;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://light.local/api/light');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { id: status.id, on: true });
    return jsonResponse({ ...status, on: true });
  };
  assert.deepEqual(await setLight('light.local', true, status.id), { ...status, on: true });
  globalThis.fetch = async () => jsonResponse({ ...status, id: 'another-device', on: true });
  await assert.rejects(setLight('light.local', true, status.id), /identity changed/);
});

test('lets firmware reject a mismatched command identity before changing its relay', async () => {
  const { setLight } = await client;
  let relay = false;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    if (command.id !== status.id) return new Response('Device identity mismatch', { status: 409 });
    relay = command.on;
    return jsonResponse({ ...status, on: relay });
  };
  await assert.rejects(setLight('light.local', true, 'another-device'), /409/);
  assert.equal(relay, false);
  assert.equal((await setLight('light.local', true, status.id)).on, true);
  assert.equal(relay, true);
});

test('rejects invalid status fields and incompatible firmware', async () => {
  const { getStatus } = await client;
  for (const body of [null, [], {}, { ...status, protocol: 'other/v1' },
    { ...status, id: ' ' }, { ...status, id: 'x'.repeat(65) },
    { ...status, name: '' }, { ...status, name: 'x'.repeat(49) }, { ...status, on: 1 }]) {
    globalThis.fetch = async () => jsonResponse(body);
    await assert.rejects(getStatus('light.local'), /invalid status|does not support/);
  }
});

test('reports HTTP errors, malformed JSON, and network errors', async () => {
  const { getStatus } = await client;
  globalThis.fetch = async () => new Response('Offline', { status: 503 });
  await assert.rejects(getStatus('light.local'), /503/);
  globalThis.fetch = async () => new Response('not JSON');
  await assert.rejects(getStatus('light.local'), /valid JSON/);
  globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(getStatus('light.local'), /Could not reach/);
});

test('cancels an in-flight request and does not start already-cancelled requests', async () => {
  const { getStatus } = await client;
  const external = new AbortController();
  let fetchSignal;
  globalThis.fetch = (_url, options) => {
    fetchSignal = options.signal;
    return new Promise(() => {});
  };
  const pending = getStatus('light.local', external.signal);
  external.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(fetchSignal.aborted, true);
  globalThis.fetch = () => { assert.fail('An already-cancelled request must not fetch'); };
  await assert.rejects(getStatus('light.local', external.signal), /cancelled/);
});

test('keeps the 2500ms timeout active while parsing a stalled response body', async () => {
  const { getStatus } = await client;
  let fetchSignal;
  globalThis.fetch = async (_url, options) => {
    fetchSignal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  };
  const start = Date.now();
  await assert.rejects(getStatus('light.local'), /did not respond/);
  assert.ok(Date.now() - start >= 2400);
  assert.equal(fetchSignal.aborted, true);
});
