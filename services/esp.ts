export type EspDevice = {
  protocol: 'light-switch/v1';
  id: string;
  name: string;
  on: boolean;
};

export const DEFAULT_ADDRESSES = ['http://192.168.4.1', 'http://light.local'];

export function normalizeAddress(input: string): string {
  const match = /^(?:http:\/\/)?([a-z\d.-]+)(?::(\d{1,5}))?\/?$/i.exec(input.trim());
  if (!match) {
    throw new Error('Enter a local device address, such as 192.168.4.1 or light.local.');
  }

  const host = match[1].toLowerCase();
  const port = match[2] === undefined ? undefined : Number(match[2]);
  if (port !== undefined && (port < 1 || port > 65535)) {
    throw new Error('The device port must be between 1 and 65535.');
  }

  const octets = host.split('.');
  const isIPv4 = octets.length === 4 && octets.every((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  const privateIPv4 = isIPv4 && (Number(octets[0]) === 10 ||
    (Number(octets[0]) === 172 && Number(octets[1]) >= 16 && Number(octets[1]) <= 31) ||
    (Number(octets[0]) === 192 && Number(octets[1]) === 168));
  const localHostname = host.endsWith('.local') && host.length <= 253 &&
    octets.length >= 2 && octets.every((label) =>
      /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label));
  if (!privateIPv4 && !localHostname) {
    throw new Error('Use a private Wi-Fi address or a .local device name.');
  }

  return `http://${host}${port !== undefined && port !== 80 ? `:${port}` : ''}`;
}

function readDevice(value: unknown): EspDevice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The device returned an invalid status.');
  }
  const device = value as Record<string, unknown>;
  if (device.protocol !== 'light-switch/v1') {
    throw new Error('This device does not support light-switch/v1.');
  }
  if (typeof device.id !== 'string' || !device.id.trim() || device.id.length > 64 ||
    typeof device.name !== 'string' || !device.name.trim() || device.name.length > 48 ||
    typeof device.on !== 'boolean') {
    throw new Error('The device returned an invalid status.');
  }
  return { protocol: device.protocol, id: device.id, name: device.name, on: device.on };
}

async function request(origin: string, path: string, command?: { id: string; on: boolean }, signal?: AbortSignal): Promise<EspDevice> {
  const address = normalizeAddress(origin);
  if (signal?.aborted) throw new Error('Connection cancelled.');

  const controller = new AbortController();
  let cancel = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new Error('Connection cancelled.'));
    };
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('The device did not respond. Check its address and your Wi-Fi connection.'));
    }, 2500);
  });
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(`${address}${path}`, {
          method: command === undefined ? 'GET' : 'POST',
          headers: command === undefined ? { Accept: 'application/json' } : {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: command === undefined ? undefined : JSON.stringify(command),
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
        }).catch(() => {
          throw new Error('Could not reach the device. Check its address and your Wi-Fi connection.');
        });
        if (command && response.status === 409) {
          throw new Error('This address belongs to a different device (409). Search again.');
        }
        if (!response.ok) throw new Error(`The device returned an error (${response.status}).`);
        const body: unknown = await response.json().catch(() => {
          throw new Error('The device did not return valid JSON.');
        });
        return readDevice(body);
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener('abort', cancel);
  }
}

export function getStatus(origin: string, signal?: AbortSignal): Promise<EspDevice> {
  return request(origin, '/api/status', undefined, signal);
}

export async function setLight(origin: string, on: boolean, expectedId: string, signal?: AbortSignal): Promise<EspDevice> {
  const device = await request(origin, '/api/light', { id: expectedId, on }, signal);
  if (device.id !== expectedId) {
    throw new Error('The device identity changed. Connect to your switch again.');
  }
  return device;
}
