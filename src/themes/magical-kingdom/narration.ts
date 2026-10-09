import * as Speech from 'expo-speech';
let sequence = 0;
export async function hush() { sequence += 1; await Speech.stop().catch(() => undefined); }
export async function speak(text: string) {
  const current = ++sequence;
  await Speech.stop().catch(() => undefined);
  if (current !== sequence) return;
  Speech.speak(text, { language: 'en-US', rate: 0.82, volume: 0.65, onError: () => {} });
}
