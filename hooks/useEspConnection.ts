import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { DEFAULT_ADDRESSES, EspDevice, getStatus, normalizeAddress, setLight } from '../services/esp';

type FoundDevice = { origin: string; device: EspDevice };
type NetworkStatus = 'checking' | 'wifi' | 'unavailable' | 'unknown';
const ADDRESS_KEY = 'light:last-address:v1';

function networkStatus(state: Network.NetworkState): NetworkStatus {
  if (Platform.OS === 'web') {
    return state.type === Network.NetworkStateType.NONE ? 'unavailable' : 'unknown';
  }
  return state.type === Network.NetworkStateType.WIFI && state.isConnected !== false
    ? 'wifi'
    : 'unavailable';
}

function networkAllowed(status: NetworkStatus) {
  return status === 'wifi' || (Platform.OS === 'web' && status === 'unknown');
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The device did not respond. Please try again.';
}

export function useEspConnection() {
  const [session, setSession] = useState<FoundDevice | null>(null);
  const [demo, setDemo] = useState(false);
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkStatus>('checking');
  const sessionRef = useRef<FoundDevice | null>(null);
  const demoRef = useRef(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const active = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const generation = useRef(0);
  const networkVersion = useRef(0);
  const networkRead = useRef(0);
  const networkRef = useRef<NetworkStatus>('checking');
  const savedAddress = useRef<string | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const pollController = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    generation.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    pollController.current = null;
  }, []);

  const current = useCallback((token: number) => (
    mounted.current && active.current && generation.current === token
  ), []);

  const updateSession = useCallback((next: FoundDevice | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const reset = useCallback((reason: string | null = null) => {
    invalidate();
    sessionRef.current = null;
    demoRef.current = false;
    busyRef.current = false;
    setSession(null);
    setDemo(false);
    setDevices([]);
    setSearching(false);
    setConnecting(null);
    setBusy(false);
    setError(reason);
  }, [invalidate]);

  const readNetwork = useCallback(async () => {
    const version = networkVersion.current;
    const read = ++networkRead.current;
    let status: NetworkStatus;
    try {
      status = networkStatus(await Network.getNetworkStateAsync());
    } catch {
      status = 'unknown';
    }
    if (networkVersion.current !== version || networkRead.current !== read) return networkRef.current;
    if (mounted.current) {
      networkRef.current = status;
      setNetwork(status);
    }
    return status;
  }, []);

  const discover = useCallback(async (address?: string) => {
    reset();
    const token = generation.current;
    setSearching(true);
    try {
      const origins = address !== undefined
        ? [normalizeAddress(address)]
        : [...new Set([...DEFAULT_ADDRESSES, ...(savedAddress.current ? [savedAddress.current] : [])])];
      const status = await readNetwork();
      if (!current(token)) return;
      if (!networkAllowed(status)) {
        setError('Connect your phone to the same Wi-Fi as your ESP, then search again.');
        return;
      }
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const results = await Promise.allSettled(origins.map(async (origin) => ({
          origin,
          device: await getStatus(origin, controller.signal),
        })));
        if (!current(token)) return;
        const found = new Map<string, FoundDevice>();
        for (const result of results) {
          if (result.status === 'fulfilled' && !found.has(result.value.device.id)) {
            found.set(result.value.device.id, result.value);
          }
        }
        setDevices([...found.values()]);
      } finally {
        controllers.current.delete(controller);
      }
    } catch (reason) {
      if (current(token)) setError(message(reason));
    } finally {
      if (current(token)) setSearching(false);
    }
  }, [current, readNetwork, reset]);

  const connect = useCallback(async (found: FoundDevice) => {
    reset();
    const token = generation.current;
    setConnecting(found.origin);
    try {
      const origin = normalizeAddress(found.origin);
      const status = await readNetwork();
      if (!current(token)) return;
      if (!networkAllowed(status)) {
        setError('Connect your phone to the same Wi-Fi as your ESP, then try again.');
        return;
      }
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const device = await getStatus(origin, controller.signal);
        if (!current(token)) return;
        if (device.id !== found.device.id) throw new Error('This address now belongs to a different ESP. Search again.');
        updateSession({ origin, device });
        savedAddress.current = origin;
        // The address is only a search hint; a saved preference never grants a connection.
        void AsyncStorage.setItem(ADDRESS_KEY, origin).catch(() => {});
      } finally {
        controllers.current.delete(controller);
      }
    } catch (reason) {
      if (current(token)) reset(message(reason));
    } finally {
      if (current(token)) setConnecting(null);
    }
  }, [current, readNetwork, reset, updateSession]);

  const toggle = useCallback(async () => {
    const connection = sessionRef.current;
    if (!connection || busyRef.current || !active.current) return;
    if (demoRef.current) {
      updateSession({ ...connection, device: { ...connection.device, on: !connection.device.on } });
      return;
    }
    if (!networkAllowed(networkRef.current)) {
      reset('Wi-Fi disconnected. Reconnect to your ESP to continue.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    pollController.current?.abort();
    const token = generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const device = await setLight(connection.origin, !connection.device.on, connection.device.id, controller.signal);
      if (current(token)) updateSession({ origin: connection.origin, device });
    } catch (reason) {
      if (current(token)) reset(message(reason));
    } finally {
      controllers.current.delete(controller);
      if (current(token)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [current, reset, updateSession]);

  const disconnect = useCallback(() => reset(), [reset]);
  const enterDemo = useCallback(() => {
    reset();
    demoRef.current = true;
    setDemo(true);
    updateSession({
      origin: 'demo',
      device: { protocol: 'light-switch/v1', id: 'demo', name: 'Living room light', on: false },
    });
  }, [reset, updateSession]);

  useEffect(() => {
    if (!session || demo) return;
    const token = generation.current;
    const timer = setInterval(async () => {
      if (!current(token) || busyRef.current || pollController.current) return;
      const controller = new AbortController();
      pollController.current = controller;
      controllers.current.add(controller);
      try {
        const device = await getStatus(session.origin, controller.signal);
        if (!current(token) || controller.signal.aborted) return;
        if (device.id !== session.device.id) throw new Error('The connected ESP changed. Please connect again.');
        updateSession({ origin: session.origin, device });
      } catch (reason) {
        if (current(token) && !controller.signal.aborted) reset(`Connection lost. ${message(reason)}`);
      } finally {
        controllers.current.delete(controller);
        if (pollController.current === controller) pollController.current = null;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [current, demo, reset, session, updateSession]);

  useEffect(() => {
    mounted.current = true;
    const initialToken = generation.current;
    void AsyncStorage.getItem(ADDRESS_KEY).then((address) => {
      if (!current(initialToken)) return;
      if (address) {
        try { savedAddress.current = normalizeAddress(address); } catch { /* Ignore stale preferences. */ }
      }
      return discover();
    }).catch(() => {
      if (current(initialToken)) void discover();
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      networkVersion.current += 1;
      const status = networkStatus(state);
      networkRef.current = status;
      setNetwork(status);
      if (!networkAllowed(status) && !demoRef.current) {
        const wasConnected = sessionRef.current !== null;
        reset(wasConnected ? 'Wi-Fi disconnected. Reconnect to your ESP to continue.' : null);
      }
    });
    const appSubscription = AppState.addEventListener('change', (state) => {
      active.current = state === 'active';
      if (!active.current) reset();
      else void discover();
    });
    return () => {
      mounted.current = false;
      invalidate();
      networkSubscription.remove();
      appSubscription.remove();
    };
  }, [current, discover, invalidate, readNetwork, reset]);

  return { session, demo, devices, searching, connecting, busy, error, network, discover, connect, toggle, disconnect, enterDemo };
}
