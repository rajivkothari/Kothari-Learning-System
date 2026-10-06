// Platform adapter: a one-line description of where the app runs, for the playtest report.
import { Platform } from 'react-native';

export const IS_BROWSER = false;

export function environmentDescription(): string {
  return `${Platform.OS} ${String(Platform.Version)} (native)`;
}
