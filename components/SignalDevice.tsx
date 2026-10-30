import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export default function SignalDevice({ searching, reduceMotion }: { searching: boolean; reduceMotion: boolean }) {
  const [signal] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!searching || reduceMotion) { signal.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(signal, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(signal, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, searching, signal]);

  return <View pointerEvents="none" aria-hidden style={styles.canvas}>
    <Svg width={120} height={112} viewBox="0 0 120 112" aria-hidden>
      <Defs><LinearGradient id="board-shell" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#E9E9E6" /></LinearGradient></Defs>
      <Path d="M34 39H28M34 49H28M34 59H28M34 69H28M34 79H28M86 39H92M86 49H92M86 59H92M86 69H92M86 79H92" stroke="#C2C2BC" strokeWidth={3} strokeLinecap="round" />
      <Rect x={34} y={29} width={52} height={64} rx={8} fill="#DADAD5" />
      <Rect x={34.5} y={26.5} width={51} height={64} rx={8} fill="url(#board-shell)" stroke="#DADAD5" />
      <Rect x={43} y={36} width={34} height={29} rx={3} fill="#E0E0DC" stroke="#CECEC8" />
      <Path d="M47 40H73M47 44H73M47 48H73" stroke="#F7F7F6" strokeWidth={1} />
      <Path d="M46 77H52V72H59M74 77H68V72H62" fill="none" stroke="#C1C1BA" strokeLinecap="round" />
      <Rect x={55} y={79} width={10} height={7} rx={2} fill="#C7C7C1" /><Circle cx={72} cy={71} r={1.5} fill="#2231DD" />
    </Svg>
    <Animated.View style={[styles.signal, { opacity: signal }]}>
      <Svg width={40} height={28} viewBox="0 0 40 28" fill="none" stroke="#2231DD" strokeWidth={1.6} strokeLinecap="round" aria-hidden><Path d="M8 8a19 19 0 0 1 24 0M12 13a12.5 12.5 0 0 1 16 0M17 18a5 5 0 0 1 6 0" /><Circle cx={20} cy={23} r={1} fill="#2231DD" stroke="none" /></Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({ canvas: { width: 120, height: 126, paddingTop: 14 }, signal: { position: 'absolute', left: 40, top: 0 } });
