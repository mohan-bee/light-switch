import Svg, { Path } from 'react-native-svg';

const paths = {
  power: ['M12 3v9', 'M6.35 5.65a9 9 0 1 0 11.3 0'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  wifi: ['M3 8.5a14 14 0 0 1 18 0', 'M6.5 12a8.5 8.5 0 0 1 11 0', 'M10 15.5a3 3 0 0 1 4 0', 'M12 19h.01'],
  arrow: ['M5 12h14', 'm14 7 5 5-5 5'],
  refresh: ['M20 7v5h-5', 'M19 12a7 7 0 1 0-1.5 4.4'],
  chip: ['M8 3v3M12 3v3M16 3v3M8 18v3M12 18v3M16 18v3M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3', 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z', 'M10 10h4v4h-4z'],
  close: ['M6 6l12 12M18 6 6 18'],
  lamp: ['M9 18h6M10 21h4', 'M8.1 14.7a6 6 0 1 1 7.8 0c-.6.5-.9 1.2-.9 2.3H9c0-1.1-.3-1.8-.9-2.3Z'],
};

export default function Icon({ name, size = 20, color = '#24392B' }: {
  name: keyof typeof paths;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name].map((d) => <Path key={d} d={d} />)}
    </Svg>
  );
}
