import { fetch as expoFetch } from 'expo/fetch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  createGoSwitchClient,
  GoSwitchHttpError,
  type DeviceInfo,
  type NetworkStatus,
  type RelayState,
} from '../../api/goSwitch';
import { findSwitchOrigin } from './discovery';
import { loadPairings, storePairing, storeSelection, type Pairing } from './pairing';

export type { Pairing } from './pairing';

type Status = 'loading' | 'unpaired' | 'discovering' | 'online' | 'offline';

type DeviceView = {
  status: Status;
  device: DeviceInfo | null;
  network: NetworkStatus | null;
  on: boolean | null;
  busy: boolean;
  error: string | null;
};

type Session = {
  controller: AbortController;
  client: ReturnType<typeof createGoSwitchClient>;
  state: RelayState;
  revision: number;
  busy: boolean;
  publish: (state: RelayState) => void;
  readSnapshot: () => Promise<void>;
  disconnect: (error: unknown) => void;
};

const native = Platform.OS === 'ios' || Platform.OS === 'android';
// React Native accepts socket handshake headers as a third constructor argument.
const NativeWebSocket = WebSocket as new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;
const initialView = {
  device: null,
  network: null,
  on: null,
  busy: false,
  error: null,
};

export function useSwitchDevice({ suspended = false }: { suspended?: boolean } = {}) {
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [view, setView] = useState<DeviceView>({ ...initialView, status: native ? 'loading' : 'unpaired' });
  const [active, setActive] = useState(() => !AppState.currentState || AppState.currentState === 'active');
  const [attempt, setAttempt] = useState(0);
  const saved = useRef<Pairing[]>([]);
  const ready = useRef(false);
  const saving = useRef(false);
  const connected = useRef<Session | null>(null);
  const failures = useRef(0);
  const pairing = pairings[0] ?? null;

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    void loadPairings().then((stored) => {
      if (disposed || ready.current) return;
      ready.current = true;
      saved.current = stored;
      setPairings(stored);
      setView({ ...initialView, status: stored.length ? 'discovering' : 'unpaired' });
    }).catch(() => {
      if (disposed || ready.current) return;
      setView({
        ...initialView,
        status: 'unpaired',
        error: 'Could not read saved pairing information. Pair the device again.',
      });
    });

    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, []);

  const refresh = useCallback(() => {
    connected.current?.controller.abort();
    failures.current = 0;
    setAttempt((value) => value + 1);
  }, []);

  const getPairing = useCallback(() => saved.current[0] ?? null, []);

  const updatePairings = useCallback(async (persist: (previous: Pairing[]) => Promise<Pairing[]>) => {
    if (!native) throw new Error('Pairing requires the mobile app.');
    if (saving.current) throw new Error('The saved switches are still being updated.');
    saving.current = true;
    try {
      const previous = ready.current ? saved.current : await loadPairings();
      const stored = await persist(previous);
      if (stored === saved.current) return;
      ready.current = true;
      saved.current = stored;
      connected.current?.controller.abort();
      failures.current = 0;
      setView({ ...initialView, status: 'discovering' });
      setPairings(stored);
    } catch {
      throw new Error('Could not save the device pairing securely.');
    } finally {
      saving.current = false;
    }
  }, []);

  const savePairing = useCallback((next: Pairing) => updatePairings((previous) => storePairing(next, previous)), [updatePairings]);
  const selectDevice = useCallback((id: string) => updatePairings((previous) => storeSelection(id, previous)), [updatePairings]);

  useEffect(() => {
    if (!pairing || suspended || !active) return;
    const controller = new AbortController();
    const { signal } = controller;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let closeEvents: (() => void) | undefined;

    function disconnect(error: unknown) {
      if (signal.aborted) return;
      controller.abort();
      closeEvents?.();
      connected.current = null;
      setView({
        ...initialView,
        status: 'offline',
        error: error instanceof Error ? error.message : 'Could not connect to the paired switch.',
      });

      if (error instanceof GoSwitchHttpError && (error.status === 401 || error.status === 403)) return;
      const delay = Math.min(30, 2 ** failures.current) * 1000;
      failures.current = Math.min(5, failures.current + 1);
      retryTimer = setTimeout(() => setAttempt((value) => value + 1), delay);
    }

    const identity = pairing;
    async function connect() {
      const origin = await findSwitchOrigin(identity, signal, () => {
        setView({ ...initialView, status: 'discovering' });
      });
      if (signal.aborted) return;
      const client = createGoSwitchClient(origin, identity.token, expoFetch);
      const device = await client.getDevice(signal);
      if (signal.aborted) return;
      if (device.device_id !== identity.deviceId) throw new Error('The device identity does not match the saved pairing.');

      const [relay, network] = await Promise.all([client.getRelay(signal), client.getNetwork(signal)]);
      if (signal.aborted) return;

      const session: Session = {
        client,
        controller,
        state: relay.state,
        revision: 0,
        busy: false,
        publish(state) {
          if (signal.aborted) return;
          session.state = state;
          session.revision += 1;
          setView((previous) => ({ ...previous, on: state === 'on' }));
        },
        async readSnapshot() {
          const revision = session.revision;
          const snapshot = await client.getRelay(signal);
          if (revision === session.revision) session.publish(snapshot.state);
        },
        disconnect,
      };
      connected.current = session;
      setView({ ...initialView, status: 'online', device, network, on: relay.state === 'on' });
      closeEvents = client.subscribe(
        (url, headers) => new NativeWebSocket(url, undefined, { headers }),
        (event) => session.publish(event.state),
        disconnect,
        () => {
          failures.current = 0;
          if (!session.busy) void session.readSnapshot().catch(disconnect);
        },
      );
    }

    void connect().catch(disconnect);
    return () => {
      controller.abort();
      closeEvents?.();
      clearTimeout(retryTimer);
      if (connected.current?.controller === controller) connected.current = null;
    };
  }, [active, attempt, pairing, suspended]);

  const toggle = useCallback(() => {
    const session = connected.current;
    if (!session || session.busy || session.controller.signal.aborted || suspended || !active) return;
    session.busy = true;
    session.revision += 1;
    const revision = session.revision;
    setView((previous) => ({ ...previous, busy: true }));

    async function writeRelay(current: Session) {
      const { state } = await current.client.setRelay(
        current.state === 'on' ? 'off' : 'on',
        current.controller.signal,
      );
      if (current.controller.signal.aborted) return;
      // A live event supersedes the earlier state. Check the device again if it
      // changed while the write was in flight.
      if (revision === current.revision) current.publish(state);
      else await current.readSnapshot();
    }

    void writeRelay(session).catch(session.disconnect).finally(() => {
      if (connected.current !== session || session.controller.signal.aborted) return;
      session.busy = false;
      setView((previous) => ({ ...previous, busy: false }));
    });
  }, [active, suspended]);

  const pairedDevices = pairings.map(({ deviceId, bleServiceName }) => ({ deviceId, bleServiceName }));
  return {
    ...view,
    busy: view.busy || suspended,
    platformAvailable: native,
    pairedDevice: pairedDevices[0] ?? null,
    pairedDevices,
    refresh,
    toggle,
    savePairing,
    selectDevice,
    getPairing,
  };
}
