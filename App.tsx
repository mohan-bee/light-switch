import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Icon from './components/Icon';
import SignalDevice from './components/SignalDevice';
import SingleSwitch from './components/SingleSwitch';
import { useEspConnection } from './hooks/useEspConnection';

function Light() {
  const connection = useEspConnection();
  const [address, setAddress] = useState('');
  const [manual, setManual] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [entrance] = useState(() => new Animated.Value(1));
  const connected = connection.session !== null;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [connected, entrance, reduceMotion]);

  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Light<Text style={styles.wordmarkDot}>.</Text></Text>
          {connected ? <Pressable accessibilityRole="button" onPress={connection.disconnect} style={styles.textButton}>
            <Text style={styles.secondaryAction}>{connection.demo ? 'Exit preview' : 'Disconnect'}</Text>
          </Pressable> : <View style={styles.networkStatus}>
            <Icon name="wifi" size={15} color="#6F6E68" />
            <Text style={styles.small}>{connection.network === 'wifi' ? 'Wi-Fi ready' : connection.network === 'unavailable' ? 'Wi-Fi needed' : 'Local connection'}</Text>
          </View>}
        </View>
        <Animated.View style={[styles.body, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          {connected && connection.session ? <View style={styles.controlScreen}>
            <View style={styles.connectionLabel} accessibilityLiveRegion="polite">
              <View style={[styles.statusDot, connection.demo && styles.demoDot]} />
              <Text style={styles.small}>{connection.demo ? 'Developer preview' : 'Device connected'}</Text>
            </View>
            <Text accessibilityRole="header" style={styles.deviceTitle}>{connection.session.device.name}</Text>
            <Text style={[styles.description, styles.centered]}>{connection.demo ? 'A little preview. No device connected.' : 'Your light, a touch away.'}</Text>
            <SingleSwitch on={connection.session.device.on} busy={connection.busy} reduceMotion={reduceMotion} onToggle={connection.toggle} />
            <Text accessibilityLiveRegion="polite" style={styles.switchHint}>{connection.busy ? 'Sending to your light…' : 'Tap to change the light'}</Text>
            {!connection.demo && <View style={styles.deviceDetails}>
              <Icon name="wifi" size={15} color="#6F6E68" />
              <Text numberOfLines={1} style={styles.small}>{connection.session.origin.replace(/^https?:\/\//, '')}</Text>
              <View style={styles.detailDivider} />
              <Text style={styles.small}>Live connection</Text>
            </View>}
          </View> : <View style={styles.setup}>
            <View style={styles.illustration}><SignalDevice searching={connection.searching || connection.connecting !== null} reduceMotion={reduceMotion} /></View>
            <Text accessibilityRole="header" style={styles.title}>Find your light.</Text>
            <Text style={styles.description}>Join your ESP’s Wi-Fi, or connect both devices to the same home network.</Text>
            <View style={styles.devices}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Available devices</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Check for devices" disabled={connection.searching || connection.connecting !== null} onPress={() => { void connection.discover(); }} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
                  {connection.searching ? <ActivityIndicator size="small" color="#2231DD" /> : <Icon name="refresh" size={17} color="#5C5B56" />}
                </Pressable>
              </View>
              {connection.devices.length > 0 ? connection.devices.map((found) => <Pressable
                key={found.origin} accessibilityRole="button" accessibilityLabel={`Connect to ${found.device.name}`}
                disabled={connection.connecting !== null || connection.searching} onPress={() => { void connection.connect(found); }}
                onFocus={() => setFocusTarget(found.origin)} onBlur={() => setFocusTarget(null)}
                style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed, focusTarget === found.origin && styles.focused]}
              >
                <Icon name="chip" size={24} color="#17181A" />
                <View style={styles.deviceCopy}><Text style={styles.deviceName}>{found.device.name}</Text><Text style={styles.small}>{found.origin.replace(/^https?:\/\//, '')}</Text></View>
                {connection.connecting === found.origin ? <ActivityIndicator size="small" color="#2231DD" /> : <Icon name="arrow" size={19} color="#2231DD" />}
              </Pressable>) : <View accessibilityLiveRegion="polite" style={styles.empty}>
                <Text style={styles.emptyTitle}>{connection.connecting ? 'Connecting to your ESP…' : connection.searching ? 'Looking for your ESP…' : connection.network === 'unavailable' ? 'Connect to Wi-Fi first' : 'No device found yet'}</Text>
                <Text style={styles.emptyDescription}>{connection.connecting ? 'Confirming your device is ready.' : connection.searching ? 'Checking for a light on your network.' : 'Check Wi-Fi, or enter its local address below.'}</Text>
              </View>}
            </View>
            {connection.error && <Text accessibilityRole="alert" style={styles.error}>{connection.error}</Text>}
            <Pressable accessibilityRole="button" aria-expanded={manual} onPress={() => setManual(!manual)} style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryAction}>Enter device address</Text><Icon name={manual ? 'minus' : 'plus'} size={16} color="#5C5B56" />
            </Pressable>
            {manual && <View style={styles.manualForm}>
              <Text style={styles.inputLabel}>ESP address</Text>
              <View style={styles.inputRow}>
                <TextInput accessibilityLabel="ESP address" value={address} onChangeText={setAddress} placeholder="192.168.4.1" placeholderTextColor="#6F6E68" autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="search" maxLength={100} selectionColor="#2231DD" onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onSubmitEditing={() => { if (address.trim()) void connection.discover(address); }} style={[styles.input, inputFocused && styles.inputFocused]} />
                <Pressable accessibilityRole="button" accessibilityLabel="Find device at address" disabled={!address.trim() || connection.searching || connection.connecting !== null} onPress={() => { void connection.discover(address); }} style={({ pressed }) => [styles.findButton, (!address.trim() || connection.searching || connection.connecting !== null) && styles.disabled, pressed && styles.pressed]}><Text style={styles.findText}>Find</Text></Pressable>
              </View>
            </View>}
            <Text style={styles.settingsHint}>Choose Wi-Fi in your phone’s Settings, then return here. Only responding ESP devices appear.</Text>
          </View>}
        </Animated.View>
        {!connected && <Pressable accessibilityRole="button" accessibilityLabel="Developer preview, bypass device connection" onPress={connection.enterDemo} onFocus={() => setFocusTarget('developer')} onBlur={() => setFocusTarget(null)} style={({ pressed }) => [styles.developerButton, pressed && styles.pressed, focusTarget === 'developer' && styles.focused]}>
          <Text style={styles.developerText}>Developer preview</Text><Icon name="arrow" size={15} color="#6F6E68" />
        </Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Light /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 16 },
  wordmark: { fontSize: 22, fontWeight: '600', letterSpacing: -0.7, color: '#17181A' }, wordmarkDot: { color: '#2231DD' },
  networkStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 }, small: { fontSize: 12, lineHeight: 18, color: '#6F6E68' },
  body: { flex: 1 }, setup: { paddingTop: 20 }, illustration: { alignItems: 'center', paddingVertical: 12, marginBottom: 14 },
  title: { color: '#17181A', fontSize: 32, lineHeight: 38, fontWeight: '500', letterSpacing: -1.1, marginBottom: 10 },
  description: { color: '#5C5B56', fontSize: 15, lineHeight: 23, maxWidth: 330 }, devices: { marginTop: 30 },
  centered: { textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E8E8E5', minHeight: 44 },
  sectionTitle: { color: '#17181A', fontSize: 13, lineHeight: 20, fontWeight: '500' }, refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  empty: { minHeight: 90, justifyContent: 'center', gap: 5 }, emptyTitle: { color: '#5C5B56', fontSize: 14, lineHeight: 21 }, emptyDescription: { color: '#6F6E68', fontSize: 12, lineHeight: 18 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E8E8E5', minHeight: 80, borderRadius: 3 },
  deviceCopy: { flex: 1, gap: 3 }, deviceName: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: '#17181A' }, error: { color: '#A23125', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  manualButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 12 }, secondaryAction: { fontSize: 13, lineHeight: 20, color: '#5C5B56' },
  manualForm: { marginTop: 4, marginBottom: 10, gap: 8 }, inputLabel: { fontSize: 12, lineHeight: 18, color: '#5C5B56' }, inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderColor: '#DADAD6', borderRadius: 10, paddingHorizontal: 12, color: '#17181A', fontSize: 15 }, inputFocused: { borderColor: '#2231DD' },
  findButton: { backgroundColor: '#2231DD', minHeight: 48, minWidth: 64, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, findText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.65 }, focused: { outlineColor: '#2231DD', outlineWidth: 2, outlineOffset: 4 },
  settingsHint: { fontSize: 12, lineHeight: 19, color: '#6F6E68', marginTop: 8 },
  developerButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 24, borderRadius: 4, paddingHorizontal: 8 }, developerText: { color: '#6F6E68', fontSize: 12, lineHeight: 18 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, controlScreen: { alignItems: 'center', paddingTop: 50, paddingBottom: 32 },
  connectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 }, statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#337255' }, demoDot: { backgroundColor: '#2231DD' },
  deviceTitle: { fontSize: 26, lineHeight: 34, fontWeight: '500', color: '#17181A', textAlign: 'center', letterSpacing: -0.7, marginBottom: 8 }, switchHint: { fontSize: 13, lineHeight: 20, color: '#6F6E68', marginTop: 6 },
  deviceDetails: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 36, maxWidth: '100%' }, detailDivider: { height: 12, width: 1, backgroundColor: '#DADAD6', marginHorizontal: 2 },
});
