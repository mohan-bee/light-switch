import type { ZeroconfService } from 'expo-zeroconf';
import { normalizeGoSwitchOrigin } from '../../api/goSwitch';
import type { Pairing } from './pairing';

type DeviceIdentity = Pick<Pairing, 'hostname' | 'deviceId'>;
type Advertisement = Pick<ZeroconfService, 'host' | 'port' | 'txt'>;
const SEARCH_MS = 6000;

export function normalizeHostname(value: unknown): string | null {
  if (typeof value !== 'string' || /\s/.test(value) || !/^[a-z\d.-]+$/i.test(value) || !/[a-z]/i.test(value)) return null;
  try {
    return normalizeGoSwitchOrigin(`https://${value}`).slice('https://'.length);
  } catch {
    return null;
  }
}

export function trustedSwitchOrigin(service: Advertisement, identity: DeviceIdentity): string | null {
  const hostname = normalizeHostname(identity.hostname);
  const deviceId = service.txt?.device_id;
  const txtHostname = normalizeHostname(service.txt?.api_hostname);
  const srvHostname = normalizeHostname(service.host);
  const port = service.port;
  if (!hostname || port === undefined || !Number.isInteger(port) || port < 1 || port > 65535 ||
      (deviceId !== undefined && deviceId !== identity.deviceId)) return null;

  // An IP-only NSD result or a local SRV alias may differ from the certificate name.
  // Use the TXT records to associate those advertisements with the paired TLS host.
  const canUseTxt = !srvHostname || (srvHostname.endsWith('.local') && !hostname.endsWith('.local'));
  const matchesTxt = deviceId === identity.deviceId && txtHostname === hostname;
  if (srvHostname !== hostname && !(canUseTxt && matchesTxt)) return null;
  return normalizeGoSwitchOrigin(`https://${hostname}:${port}`);
}

export async function findSwitchOrigin(
  identity: DeviceIdentity,
  signal: AbortSignal,
  onStart: () => void,
): Promise<string> {
  const { default: Zeroconf, isAvailable } = await import('expo-zeroconf');
  if (signal.aborted) throw new Error('Discovery cancelled.');
  if (!isAvailable) throw new Error('Device discovery requires a native development build.');

  return new Promise((resolve, reject) => {
    const scanner = new Zeroconf();
    const timer = setTimeout(() => finish(null, 'The paired switch was not found on this Wi-Fi network.'), SEARCH_MS);

    function finish(origin: string | null, message?: string) {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      scanner.removeAllListeners();
      scanner.removeDeviceListeners();
      if (origin) resolve(origin);
      else reject(new Error(message));
    }

    function cancel() {
      finish(null, 'Discovery cancelled.');
    }

    signal.addEventListener('abort', cancel, { once: true });
    scanner.on('start', onStart);
    scanner.on('resolved', (service: ZeroconfService) => {
      const origin = trustedSwitchOrigin(service, identity);
      if (origin) finish(origin);
    });
    scanner.on('error', () => finish(null, 'Could not discover devices. Check local network access.'));
    scanner.scan('goswitch', 'tcp', 'local.');
  });
}
