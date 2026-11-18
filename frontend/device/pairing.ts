import * as SecureStore from 'expo-secure-store';
import { isDeviceId, isDeviceToken } from '../../api/goSwitch';
import { normalizeHostname } from './discovery';

export type Pairing = {
  deviceId: string;
  token: string;
  hostname: string;
  bleServiceName: string;
  username: string;
  proofOfPossession: string;
};

const INDEX_KEY = 'go-switch.devices.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function deviceKey(deviceId: string) {
  return `go-switch.pairing.v1.${deviceId}`;
}

function isCredential(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function readPairing(value: unknown): Pairing {
  if (!value || typeof value !== 'object') throw new Error('The pairing information is invalid.');
  const record = value as Record<string, unknown>;
  const { deviceId, token, bleServiceName, username, proofOfPossession } = record;
  const hostname = normalizeHostname(record.hostname);
  if (!isDeviceId(deviceId) || !isDeviceToken(token) || !hostname ||
      !isCredential(bleServiceName, 64) || !isCredential(username, 128) ||
      !isCredential(proofOfPossession, 256)) {
    throw new Error('The pairing information is invalid.');
  }
  return { deviceId, token, hostname, bleServiceName, username, proofOfPossession };
}

export async function loadPairings(): Promise<Pairing[]> {
  const rawIndex = await SecureStore.getItemAsync(INDEX_KEY, options);
  if (rawIndex === null) return [];
  const ids: unknown = JSON.parse(rawIndex);
  if (!Array.isArray(ids) || !ids.every(isDeviceId)) throw new Error('The device list is invalid.');

  const records = await Promise.all([...new Set(ids)].map(async (id) => {
    const stored = await SecureStore.getItemAsync(deviceKey(id), options);
    if (stored === null) return null;
    try {
      const pairing = readPairing(JSON.parse(stored));
      return pairing.deviceId === id ? pairing : null;
    } catch {
      return null;
    }
  }));
  return records.filter((record): record is Pairing => record !== null);
}

async function storeIndex(pairings: Pairing[]) {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(pairings.map(({ deviceId }) => deviceId)), options);
}

export async function storePairing(next: Pairing, previous: Pairing[]): Promise<Pairing[]> {
  const pairing = readPairing(next);
  const remaining = previous.filter(({ deviceId }) => deviceId !== pairing.deviceId);
  const pairings = [pairing, ...remaining];
  const key = deviceKey(pairing.deviceId);
  await SecureStore.setItemAsync(key, JSON.stringify(pairing), options);
  if (previous[0]?.deviceId !== pairing.deviceId) {
    try {
      await storeIndex(pairings);
    } catch (error) {
      // Restore the record if the new selection could not be saved.
      const existing = previous.find(({ deviceId }) => deviceId === pairing.deviceId);
      if (existing) await SecureStore.setItemAsync(key, JSON.stringify(existing), options);
      else await SecureStore.deleteItemAsync(key, options);
      throw error;
    }
  }
  return pairings;
}

export async function storeSelection(deviceId: string, previous: Pairing[]): Promise<Pairing[]> {
  const selected = previous.find((pairing) => pairing.deviceId === deviceId);
  if (!selected) throw new Error('This switch has not been paired.');
  if (selected === previous[0]) return previous;
  const pairings = [selected, ...previous.filter((pairing) => pairing !== selected)];
  await storeIndex(pairings);
  return pairings;
}
