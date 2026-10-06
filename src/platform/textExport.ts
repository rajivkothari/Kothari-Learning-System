// Platform adapter: hand a text report to an adult. Native: the system share sheet.
// The browser build resolves textExport.web.ts (clipboard and a .txt download).
import { Share } from 'react-native';

export const TEXT_EXPORT = { share: 'Copy / share', canSaveFile: false } as const;

export async function shareText(text: string): Promise<string> {
  await Share.share({ message: text });
  return 'Shared';
}

export async function saveTextFile(_filename: string, _text: string): Promise<string> {
  return 'Saving a file is not available here. Use share.';
}
