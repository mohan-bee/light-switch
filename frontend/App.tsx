import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DeviceSettings from './components/DeviceSettings';
import SingleSwitch from './components/SingleSwitch';
import { useSwitchDevice } from './device/useSwitchDevice';
import { isProvisioningAvailable } from './modules/goswitch-provisioning';

export default function App() {
  const [previewOn, setPreviewOn] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const session = useSwitchDevice({ suspended: provisioning });
  const preview = Platform.OS === 'web';
  const canSetUp = session.platformAvailable && isProvisioningAvailable();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  let hint = 'Tap to change the light';
  if (!preview) {
    if (session.busy) hint = 'Updating the switch…';
    else if (!canSetUp) hint = 'Use a native build to set up your switch.';
    else if (session.status === 'loading') hint = 'Loading paired switch…';
    else if (session.status === 'unpaired') hint = 'Set up your switch to control it.';
    else if (session.status === 'discovering') hint = 'Looking for your switch on Wi-Fi…';
    else if (session.status === 'offline') hint = 'Switch offline';
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>Light<Text style={styles.wordmarkDot}>.</Text></Text>
            {canSetUp && session.status !== 'loading' && (
              <Pressable accessibilityRole="button" onPress={() => setSettingsOpen(true)} style={styles.settingsButton}>
                <Text style={styles.settingsLabel}>{session.pairedDevice ? 'Device settings' : 'Set up device'}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.control}>
            <Text accessibilityRole="header" style={styles.title}>
              {session.pairedDevices.length > 1 ? session.pairedDevice?.bleServiceName ?? 'Living room light' : 'Living room light'}
            </Text>
            <SingleSwitch
              on={preview ? previewOn : session.on === true}
              disabled={!preview && (session.status !== 'online' || session.on === null || provisioning)}
              busy={!preview && session.busy}
              reduceMotion={reduceMotion}
              onToggle={preview ? () => setPreviewOn((current) => !current) : session.toggle}
            />
            <Text accessibilityLiveRegion="polite" style={styles.hint}>{hint}</Text>
            {!!session.error && <Text accessibilityRole="alert" style={styles.error}>{session.error}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
      {settingsOpen && (
        <DeviceSettings
          reduceMotion={reduceMotion}
          pairing={session.getPairing()}
          pairedDevices={session.pairedDevices}
          device={session.device}
          network={session.network}
          onRefresh={session.refresh}
          onProvisioning={setProvisioning}
          onSelect={session.selectDevice}
          onClose={() => setSettingsOpen(false)}
          onSave={async (pairing) => {
            await session.savePairing(pairing);
            setSettingsOpen(false);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, gap: 12 },
  wordmark: { fontSize: 22, fontWeight: '600', letterSpacing: -0.7, color: '#17181A' },
  wordmarkDot: { color: '#2231DD' },
  settingsButton: { minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  settingsLabel: { fontSize: 14, color: '#2231DD', fontWeight: '500', textAlign: 'right' },
  control: { alignItems: 'center', paddingTop: 50, paddingBottom: 32 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '500', color: '#17181A', textAlign: 'center', letterSpacing: -0.7, marginBottom: 8 },
  hint: { fontSize: 13, lineHeight: 20, color: '#6F6E68', textAlign: 'center', marginTop: 6 },
  error: { fontSize: 13, lineHeight: 20, color: '#9B281E', textAlign: 'center', marginTop: 8 },
});
