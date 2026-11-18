import { useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, type TextInputProps, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DeviceInfo, NetworkStatus } from '../../api/goSwitch';
import type { Pairing } from '../device/useSwitchDevice';
import { provisionDevice, scanProvisioningDevices } from '../modules/goswitch-provisioning';

type NearbySwitch = Awaited<ReturnType<typeof scanProvisioningDevices>>[number];
type SettingsProps = {
  pairing: Pairing | null;
  pairedDevices: Pick<Pairing, 'deviceId' | 'bleServiceName'>[];
  device: DeviceInfo | null;
  network: NetworkStatus | null;
  reduceMotion: boolean;
  onRefresh: () => void;
  onProvisioning: (active: boolean) => void;
  onSelect: (deviceId: string) => Promise<void>;
  onClose: () => void;
  onSave: (pairing: Pairing) => Promise<void>;
};

function Action({ label, onPress, disabled = false, primary = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.primary, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        {...props}
        style={styles.input}
      />
    </View>
  );
}

export default function DeviceSettings({
  pairing, pairedDevices, device, network, reduceMotion, onRefresh, onProvisioning, onSelect, onClose, onSave,
}: SettingsProps) {
  const [mode, setMode] = useState<'details' | 'pair' | 'change'>(pairing ? 'details' : 'pair');
  const [nearby, setNearby] = useState<NearbySwitch[] | null>(null);
  const [selected, setSelected] = useState<NearbySwitch | null>(null);
  const [username, setUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'scanning' | 'provisioning' | 'saving' | 'selecting' | null>(null);
  const [pendingPairing, setPendingPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState('');
  const busy = phase !== null;
  const configuring = mode !== 'details';
  const owner = mode === 'change' ? pairing : null;

  async function findNearby() {
    setError('');
    setNearby(null);
    setPhase('scanning');
    try {
      const found = await scanProvisioningDevices();
      setNearby(owner ? found.filter((switchDevice) => switchDevice.name === owner.bleServiceName) : found);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not look for nearby switches.');
    } finally {
      setPhase(null);
    }
  }

  async function configure() {
    if (!selected || busy) return;
    let next = pendingPairing;
    setError('');
    onProvisioning(true);
    try {
      if (!next) {
        setPhase('provisioning');
        const security = owner
          ? { username: owner.username, proofOfPossession: owner.proofOfPossession }
          : { username, proofOfPossession: setupPassword };
        const result = await provisionDevice({
          id: selected.id, ...security, ssid, password,
          ...(owner && { existing: { deviceId: owner.deviceId, hostname: owner.hostname, token: owner.token } }),
        });
        next = { ...result, ...security, bleServiceName: selected.name };
        setPendingPairing(next);
        setPassword('');
        setSetupPassword('');
      }
      setPhase('saving');
      await onSave(next);
    } catch (reason) {
      if (next) setError('Your switch joined Wi-Fi. Try saving the pairing again.');
      else setError(reason instanceof Error ? reason.message : 'Could not configure the switch over Bluetooth.');
    } finally {
      setPhase(null);
      onProvisioning(false);
    }
  }

  async function selectDevice(deviceId: string) {
    setPhase('selecting');
    setError('');
    try {
      await onSelect(deviceId);
      onClose();
    } catch {
      setError('Could not select this switch. Try again.');
    } finally {
      setPhase(null);
    }
  }

  const heading = mode === 'details' ? 'Device settings' : mode === 'change' ? 'Change Wi-Fi' : 'Set up your switch';
  const ready = !!pendingPairing || (ssid.length > 0 && (!!owner || !!(username && setupPassword)));

  return (
    <Modal
      visible
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={() => { if (!busy) onClose(); }}
    >
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{heading}</Text>
              <Action label="Close" onPress={onClose} disabled={busy} />
            </View>
            {!configuring && pairing && (
              <>
                <View style={styles.details}>
                  <Text style={styles.label}>Paired switch</Text>
                  <Text style={styles.body}>{device?.model ?? pairing.deviceId}</Text>
                  {!!device && <Text style={styles.body}>Firmware {device.firmware}</Text>}
                </View>
                <View style={styles.details}>
                  <Text style={styles.label}>Wi-Fi</Text>
                  <Text style={styles.body}>
                    {network?.connected ? (network.ssid || 'Connected') : 'Network details unavailable'}
                  </Text>
                  {!!network?.ip && <Text style={styles.body}>{network.ip}</Text>}
                </View>
                <Action label="Change Wi-Fi" onPress={() => { setError(''); setMode('change'); }} disabled={busy} primary />
                {!device && (
                  <Action label="Find on Wi-Fi" disabled={busy} onPress={() => { onRefresh(); onClose(); }} />
                )}
                {pairedDevices.filter((item) => item.deviceId !== pairing.deviceId).map((item) => (
                  <Action
                    key={item.deviceId}
                    label={`Control ${item.bleServiceName}`}
                    disabled={busy}
                    onPress={() => { void selectDevice(item.deviceId); }}
                  />
                ))}
                <Action label="Pair another switch" onPress={() => { setError(''); setMode('pair'); }} disabled={busy} />
              </>
            )}
            {configuring && !selected && (
              <>
                <Text style={styles.body}>Put your switch in setup mode and keep your phone nearby.</Text>
                {nearby?.length === 0 && <Text style={styles.body}>No switches found. Check setup mode and try again.</Text>}
                {nearby?.map((item) => (
                  <Action key={item.id} label={item.name} onPress={() => setSelected(item)} />
                ))}
                <Action
                  label={phase === 'scanning' ? 'Looking for switches…' : nearby ? 'Scan again' : 'Find nearby switches'}
                  onPress={() => { void findNearby(); }}
                  disabled={busy}
                  primary
                />
              </>
            )}
            {configuring && selected && (
              <>
                <Text style={styles.body}>{selected.name}</Text>
                {!pendingPairing && (
                  <>
                    {!owner && (
                      <>
                        <Text style={styles.body}>Enter the setup credentials supplied with your switch.</Text>
                        <Field label="Setup username" value={username} onChangeText={setUsername} editable={!busy} />
                        <Field label="Setup password" value={setupPassword} onChangeText={setSetupPassword} editable={!busy} secureTextEntry />
                      </>
                    )}
                    <Field label="Wi-Fi name (SSID)" value={ssid} onChangeText={setSsid} editable={!busy} />
                    <Field label="Wi-Fi password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry />
                  </>
                )}
                <Action
                  label={phase === 'provisioning' ? 'Connecting to Wi-Fi…' : phase === 'saving' ? 'Saving pairing…' :
                    pendingPairing ? 'Save pairing' : 'Connect to Wi-Fi'}
                  onPress={() => { void configure(); }}
                  disabled={busy || !ready}
                  primary
                />
                {!pendingPairing && (
                  <Action label="Back to nearby switches" disabled={busy} onPress={() => {
                    setSelected(null);
                    setUsername('');
                    setSetupPassword('');
                    setError('');
                  }} />
                )}
              </>
            )}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flexShrink: 1, color: '#17181A', fontSize: 26, lineHeight: 34, fontWeight: '500', letterSpacing: -0.7 },
  body: { color: '#5C5B56', fontSize: 15, lineHeight: 23 },
  details: { gap: 3, borderBottomColor: '#E8E8E5', borderBottomWidth: 1, paddingBottom: 12 },
  field: { gap: 6 },
  label: { color: '#17181A', fontSize: 14, fontWeight: '500' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#878682', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#17181A' },
  action: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  actionText: { color: '#2231DD', fontSize: 15, fontWeight: '500', textAlign: 'center' },
  primary: { borderRadius: 10, backgroundColor: '#2231DD' },
  primaryText: { color: '#FFFFFF' },
  dimmed: { opacity: 0.5 },
  error: { color: '#9B281E', fontSize: 14, lineHeight: 20 },
});
