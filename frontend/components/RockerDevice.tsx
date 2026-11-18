import { useId } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

type RockerDeviceProps = {
  active: Animated.Value;
  press: Animated.Value;
};

export default function RockerDevice({ active, press }: RockerDeviceProps) {
  const id = useId().replace(/:/g, '');
  const offOpacity = active.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.device} pointerEvents="none" aria-hidden>
      <Svg width={80} height={96} viewBox="0 0 80 96" aria-hidden>
        <Defs>
          <LinearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.48" stopColor="#F4F5F7" />
            <Stop offset="1" stopColor="#DDE0E5" />
          </LinearGradient>
          <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0.9">
            <Stop offset="0" stopColor="#DCE0E6" />
            <Stop offset="0.45" stopColor="#A8AEB9" />
            <Stop offset="1" stopColor="#ECEEF2" />
          </LinearGradient>
          <LinearGradient id={`${id}-well`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#424853" />
            <Stop offset="0.4" stopColor="#747C88" />
            <Stop offset="1" stopColor="#A1A7B1" />
          </LinearGradient>
          <RadialGradient id={`${id}-shadow`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#171D2B" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#171D2B" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={40} cy={89} rx={37} ry={7} fill={`url(#${id}-shadow)`} />
        <Rect x={4} y={6} width={72} height={86} rx={12} fill="#D2D6DD" />
        <Rect x={4.5} y={3.5} width={71} height={86} rx={12} fill={`url(#${id}-shell)`} stroke="#D8DCE3" />
        <Path d="M17 5H63C69.1 5 74 9.9 74 16V74" fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1} />
        <Rect x={9} y={11} width={62} height={73} rx={8} fill={`url(#${id}-rim)`} />
        <Rect testID="rocker-slot" x={10.5} y={12.5} width={59} height={70} rx={6.5} fill={`url(#${id}-well)`} />
        <Path d="M16.5 13H63.5C66.5 13 69 15.5 69 18.5V76" fill="none" stroke="#505762" strokeOpacity={0.55} />
        <Path d="M15 83.5H65" stroke="#FFFFFF" strokeOpacity={0.8} strokeLinecap="round" />
      </Svg>

      <Animated.View testID="rocker-face" style={[styles.face, {
        transform: [
          { perspective: 320 },
          { rotateX: active.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] }) },
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) },
        ],
      }]}>
        <Svg width={56} height={66} viewBox="0 0 56 66" aria-hidden>
          <Defs>
            <LinearGradient id={`${id}-face`} x1="0" y1="0" x2="0.1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.42" stopColor="#F4F5F7" />
              <Stop offset="1" stopColor="#DFE3E9" />
            </LinearGradient>
            <LinearGradient id={`${id}-curvature`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#C8CDD6" stopOpacity={0.45} />
              <Stop offset="0.12" stopColor="#FFFFFF" stopOpacity={0.1} />
              <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="1" stopColor="#AFB6C3" stopOpacity={0.28} />
            </LinearGradient>
          </Defs>
          <Rect x={0.5} y={1.5} width={55} height={64} rx={5} fill="#BCC3CE" />
          <Rect x={0.5} y={0.5} width={55} height={63} rx={5} fill={`url(#${id}-face)`} stroke="#F9FAFC" />
          <Rect x={1} y={1} width={54} height={62} rx={4.5} fill={`url(#${id}-curvature)`} />
          <Path d="M6 1.5H50C52.5 1.5 54.5 3.5 54.5 6" fill="none" stroke="#FFFFFF" strokeWidth={1} />
          <Path d="M1.5 59C1.5 61.5 3.5 63.5 6 63.5H50C52.5 63.5 54.5 61.5 54.5 59" fill="none" stroke="#B4BCC8" strokeOpacity={0.65} />
          <Rect x={20.5} y={12} width={15} height={3} rx={1.5} fill="#BFC4CE" />
          <Path d="M22 12.5H34" stroke="#A9AFBA" strokeWidth={0.7} strokeLinecap="round" />
          <Path d="M28 45V50M24.6 47.4a4.8 4.8 0 1 0 6.8 0" fill="none" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" transform="translate(0 0.6)" />
          <Path d="M28 45V50M24.6 47.4a4.8 4.8 0 1 0 6.8 0" fill="none" stroke="#929AA8" strokeOpacity={0.72} strokeWidth={1.1} strokeLinecap="round" />
        </Svg>
        <Animated.View style={[styles.upperContact, { opacity: active }]} />
        <Animated.View style={[styles.lowerContact, { opacity: offOpacity }]} />
        <Animated.View testID="rocker-indicator" style={[styles.indicator, { opacity: active }]}>
          <Svg width={42} height={21} viewBox="0 0 42 21" aria-hidden>
            <Defs>
              <RadialGradient id={`${id}-led-glow`} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#6875FF" stopOpacity={0.5} />
                <Stop offset="0.45" stopColor="#6875FF" stopOpacity={0.19} />
                <Stop offset="1" stopColor="#6875FF" stopOpacity={0} />
              </RadialGradient>
              <LinearGradient id={`${id}-led`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#A7B4FF" />
                <Stop offset="1" stopColor="#2231DD" />
              </LinearGradient>
            </Defs>
            <Ellipse cx={21} cy={10.5} rx={21} ry={10.5} fill={`url(#${id}-led-glow)`} />
            <Rect x={13.5} y={9} width={15} height={3} rx={1.5} fill={`url(#${id}-led)`} />
            <Path d="M15.5 9.6H26.5" stroke="#D8DFFF" strokeWidth={0.65} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  device: { width: 80, height: 96 },
  face: {
    position: 'absolute',
    top: 15,
    left: 12,
    width: 56,
    height: 66,
    borderRadius: 5,
    boxShadow: '0px 3px 3px rgba(30, 37, 50, 0.22)',
  },
  upperContact: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: 22,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: 'rgba(82, 91, 111, 0.055)',
  },
  lowerContact: {
    position: 'absolute',
    bottom: 2,
    left: 1,
    right: 1,
    height: 22,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: 'rgba(82, 91, 111, 0.045)',
  },
  indicator: { position: 'absolute', left: 7, top: 3, width: 42, height: 21 },
});
