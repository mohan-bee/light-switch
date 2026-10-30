import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import RockerDevice from './RockerDevice';

export default function SingleSwitch({ on, busy, reduceMotion, onToggle }: { on: boolean; busy: boolean; reduceMotion: boolean; onToggle: () => void }) {
  const [active] = useState(() => new Animated.Value(on ? 1 : 0));
  const [press] = useState(() => new Animated.Value(0));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (reduceMotion) { active.setValue(on ? 1 : 0); return; }
    const animation = Animated.timing(active, { toValue: on ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [active, on, reduceMotion]);

  function pressFeedback(pressed: boolean) {
    if (reduceMotion) { press.setValue(pressed ? 1 : 0); return; }
    Animated.spring(press, { toValue: pressed ? 1 : 0, stiffness: 300, damping: 24, mass: 0.8, useNativeDriver: true }).start();
  }

  return <View style={styles.stage}>
    <Pressable accessibilityRole="switch" accessibilityLabel="Light" accessibilityState={{ checked: on, busy, disabled: busy }} aria-checked={on} aria-busy={busy} aria-disabled={busy} disabled={busy} onPress={onToggle} onPressIn={() => pressFeedback(true)} onPressOut={() => pressFeedback(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      {...(Platform.OS === 'web' ? { onKeyDown: (event: { nativeEvent: { key: string; repeat?: boolean }; preventDefault: () => void }) => { if (event.nativeEvent.key === ' ') { event.preventDefault(); if (!event.nativeEvent.repeat && !busy) onToggle(); } } } : {})}
      style={[styles.hitArea, focused && styles.focused]}>
      <View pointerEvents="none" aria-hidden style={styles.hardware}><RockerDevice active={active} press={press} /></View>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 260, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  hitArea: { width: 144, height: 184, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
  hardware: { width: 80, height: 96, transform: [{ scale: 1.7 }] },
  focused: { outlineWidth: 2, outlineOffset: 8, outlineColor: '#2231DD' },
});
