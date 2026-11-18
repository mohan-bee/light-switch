export type RelayState = 'on' | 'off';

export type DeviceInfo = {
  device_id: string;
  model: string;
  firmware: string;
  status: string;
};

export type NetworkStatus = {
  connected: boolean;
  ssid?: string;
  ip?: string;
};

export type RelayEvent = {
  event: 'relay.state_changed';
  relay: 1;
  state: RelayState;
};

export type GoSwitchSocket = Pick<WebSocket, 'onopen' | 'onmessage' | 'onerror' | 'onclose' | 'close'>;
export type GoSwitchSocketFactory = (url: string, headers: Record<string, string>) => GoSwitchSocket;
export type GoSwitchFetcher = (
  url: string,
  options: Pick<RequestInit, 'method' | 'headers' | 'body' | 'signal' | 'redirect' | 'credentials' | 'cache'>,
) => Promise<Pick<Response, 'ok' | 'status' | 'redirected' | 'url' | 'json'>>;

const TIMEOUT_MS = 5000;
const API_PATH = '/api/v1';

export function normalizeGoSwitchOrigin(origin: string): string {
  const match = /^https:\/\/([a-z0-9.-]+)(?::(\d{1,5}))?\/?$/i.exec(origin);
  if (!match || match[0] !== origin) throw new Error('The device needs an HTTPS address.');
  const host = match[1].toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  const lastLabel = labels[labels.length - 1];
  const ipv4 = labels.length === 4 && labels.every((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  const dns = labels.length > 1 && /[a-z]/.test(lastLabel) && !/^0x[\da-f]+$/.test(lastLabel) &&
    labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label));
  const port = match[2] === undefined ? 443 : Number(match[2]);
  if (host.length > 253 || (!ipv4 && !dns) || port < 1 || port > 65535) {
    throw new Error('The device returned an invalid HTTPS address.');
  }
  return `https://${host}${port === 443 ? '' : `:${port}`}`;
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && /^[a-z\d._-]+$/i.test(value) && !/\s/.test(value);
}

export function isDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && /^[a-z\d._~+/-]+=*$/i.test(value) && !/\s/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isRelayState(value: unknown): value is RelayState {
  return value === 'on' || value === 'off';
}

function readDevice(value: unknown): DeviceInfo {
  if (!isRecord(value) || !isDeviceId(value.device_id) || !isText(value.model, 64) ||
    !isText(value.firmware, 64) || !isText(value.status, 32)) {
    throw new Error('The device returned invalid device information.');
  }
  const { device_id, model, firmware, status } = value;
  return { device_id, model, firmware, status };
}

function readRelay(value: unknown): { state: RelayState } {
  if (!isRecord(value) || !isRelayState(value.state)) {
    throw new Error('The device returned an invalid relay state.');
  }
  return { state: value.state };
}

function readNetwork(value: unknown): NetworkStatus {
  if (!isRecord(value) || typeof value.connected !== 'boolean' ||
    (value.ssid !== undefined && !isText(value.ssid, 32)) ||
    (value.ip !== undefined && !isText(value.ip, 64))) {
    throw new Error('The device returned an invalid network status.');
  }
  const { connected, ssid, ip } = value;
  return { connected, ...(ssid === undefined ? {} : { ssid }), ...(ip === undefined ? {} : { ip }) };
}

function readRelayEvent(data: unknown): RelayEvent | undefined {
  if (typeof data !== 'string' || data.length > 4096) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.event !== 'relay.state_changed' || value.relay !== 1 ||
    !isRelayState(value.state)) return undefined;
  return { event: value.event, relay: value.relay, state: value.state };
}

export class GoSwitchHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status === 401 || status === 403 ? 'The device rejected its pairing credentials.' :
      `The device returned an error (${status}).`);
    this.name = 'GoSwitchHttpError';
    this.status = status;
  }
}

// Callers resolve the origin using the TLS name obtained during secure BLE pairing.
export function createGoSwitchClient(origin: string, token: string, fetcher: GoSwitchFetcher = globalThis.fetch) {
  const address = normalizeGoSwitchOrigin(origin);
  if (!isDeviceToken(token)) throw new Error('The device returned invalid pairing credentials.');
  const authorization = { Authorization: `Bearer ${token}` };

  async function request(path: string, signal?: AbortSignal, state?: RelayState): Promise<unknown> {
    if (signal?.aborted) throw new Error('Connection cancelled.');
    const url = `${address}${API_PATH}${path}`;
    const controller = new AbortController();
    let cancel = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => {
        reject(new Error('Connection cancelled.'));
        controller.abort();
      };
      timer = setTimeout(() => {
        reject(new Error('The device did not respond.'));
        controller.abort();
      }, TIMEOUT_MS);
    });
    signal?.addEventListener('abort', cancel, { once: true });

    try {
      return await Promise.race([interrupted, (async () => {
        const response = await fetcher(url, {
          method: state === undefined ? 'GET' : 'PUT',
          headers: {
            ...authorization,
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store',
            ...(state === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: state === undefined ? undefined : JSON.stringify({ state }),
          signal: controller.signal,
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
        }).catch(() => {
          throw new Error('Could not reach the device securely. Check Wi-Fi and the device certificate.');
        });
        if (response.redirected || (response.url && response.url !== url)) {
          throw new Error('The device redirected the request.');
        }
        if (!response.ok) throw new GoSwitchHttpError(response.status);
        return await response.json().catch(() => {
          throw new Error('The device did not return valid JSON.');
        });
      })()]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    async getDevice(signal?: AbortSignal) {
      return readDevice(await request('/device', signal));
    },
    async getRelay(signal?: AbortSignal) {
      return readRelay(await request('/relay', signal));
    },
    async setRelay(state: RelayState, signal?: AbortSignal) {
      if (!isRelayState(state)) throw new Error('Select a valid relay state.');
      const value = await request('/relay', signal, state);
      if (!isRecord(value) || value.success !== true) {
        throw new Error('The device did not confirm the relay change.');
      }
      return readRelay(value.relay);
    },
    async getNetwork(signal?: AbortSignal) {
      return readNetwork(await request('/network', signal));
    },
    subscribe(
      createSocket: GoSwitchSocketFactory,
      onEvent: (event: RelayEvent) => void,
      onDisconnect?: (error: Error) => void,
      onConnect?: () => void,
    ) {
      let socket: GoSwitchSocket;
      try {
        socket = createSocket(`wss${address.slice('https'.length)}${API_PATH}/events`, { ...authorization });
      } catch {
        throw new Error('Could not open the secure device event connection.');
      }
      let closed = false;
      const timer = setTimeout(() => disconnect('The device event connection timed out.'), TIMEOUT_MS);
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      function disconnect(message: string) {
        if (closed) return;
        close();
        onDisconnect?.(new Error(message));
      }
      socket.onopen = () => {
        if (closed) return;
        clearTimeout(timer);
        onConnect?.();
      };
      socket.onmessage = ({ data }) => {
        if (closed) return;
        const event = readRelayEvent(data);
        if (event) onEvent(event);
      };
      socket.onerror = () => disconnect('The secure device event connection failed.');
      socket.onclose = () => disconnect('The device event connection closed.');
      return close;
    },
  };
}
