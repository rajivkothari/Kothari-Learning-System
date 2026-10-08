// TEMPORARY placeholder screens (M9), one per game, until WG's and CC's screens land in the
// registry. Clearly a placeholder: the game's name, one line, BACK TO ELEVATOR. They touch nothing
// in the session (no answer, no help, no save), so they can never write learning records.
import { StyleSheet, Text, View } from 'react-native';

import { DISPLAY, eq, readingAt } from '../ui/palette';
import { BackToElevatorButton } from './hostControls';
import { HOST_COPY } from './hostCopy';
import type { MiniGameScreenProps } from './types';

function Placeholder({ titleKey, insets, text, onExit }: MiniGameScreenProps & { titleKey: string }) {
  return (
    <View testID={`minigame-placeholder-${titleKey}`} style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}>
      <Text style={[DISPLAY(1.4), styles.title]} accessibilityRole="header">
        {HOST_COPY.games[titleKey] ?? titleKey}
      </Text>
      <Text style={[readingAt(text.passage), styles.line]}>{HOST_COPY.placeholder}</Text>
      <Text style={[readingAt(text.label, 'label'), styles.tag]}>PLACEHOLDER</Text>
      <BackToElevatorButton onPress={onExit} size={text.label + 2} />
    </View>
  );
}

export function WordGolfPlaceholder(props: MiniGameScreenProps) {
  return <Placeholder {...props} titleKey="wordGolf" />;
}

export function CargoCommanderPlaceholder(props: MiniGameScreenProps) {
  return <Placeholder {...props} titleKey="cargoCommander" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: eq.night },
  title: { color: eq.amber, textAlign: 'center' },
  line: { color: eq.text, textAlign: 'center' },
  tag: { color: eq.textDim, letterSpacing: 3 },
});
