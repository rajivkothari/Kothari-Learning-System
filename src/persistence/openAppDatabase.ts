// Platform adapter: the app's database. Native (iOS, Android/Fire): expo-sqlite.
// The browser build resolves openAppDatabase.web.ts instead (Metro platform extensions).
import type { SqlDatabase } from './driver';
import { openExpoDatabase } from './expoDatabase';

export const APP_STORAGE = 'expo-sqlite (native file)';

export function openAppDatabase(name: string): Promise<SqlDatabase> {
  return openExpoDatabase(name);
}

/** Developer reset of the whole local database. Not available on native: use learner resets. */
export async function wipeAppDatabase(_name: string): Promise<boolean> {
  return false;
}
