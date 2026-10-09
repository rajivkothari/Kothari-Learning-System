/** Browser voices must explicitly be local. No remote voice service on a gameplay path. */
import * as Speech from 'expo-speech';
let sequence = 0;
export async function hush() { sequence += 1; await Speech.stop().catch(() => undefined); }
export async function speak(text: string) {
  const current = ++sequence;
  await Speech.stop().catch(() => undefined);
  const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
  const voice = voices.find((v) => 'localService' in v && v.localService === true && v.language.startsWith('en'));
  if (!voice || current !== sequence) return;
  Speech.speak(text, { voice: voice.identifier, language: voice.language, rate: 0.82, volume: 0.65 });
}
