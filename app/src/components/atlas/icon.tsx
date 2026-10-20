import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type AtlasIconName = 'macros' | 'exercises' | 'mic' | 'close' | 'check' | 'chevron';

const featherNames = {
  macros: 'pie-chart',
  mic: 'mic',
  close: 'x',
  check: 'check',
  chevron: 'chevron-right',
} as const;

type Props = { name: AtlasIconName; size?: number; color: string };

export function AtlasIcon({ name, size = 24, color }: Props) {
  if (name === 'exercises') {
    return <MaterialIcons name="fitness-center" size={size} color={color} />;
  }
  return <Feather name={featherNames[name]} size={size} color={color} />;
}
