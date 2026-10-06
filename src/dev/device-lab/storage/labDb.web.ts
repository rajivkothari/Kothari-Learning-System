// Browser build of the Device Lab: the storage probe measures expo-sqlite on a real device, so
// it does not run in a browser (a browser number would be meaningless for Fire). The probe
// reports this as an error instead of pulling expo-sqlite's web build into the bundle.
import type { SqlDriver } from './labRepository';

export function openLabDb(): Promise<SqlDriver> {
  return Promise.reject(new Error('Storage probe runs on devices only (not in the browser build).'));
}
