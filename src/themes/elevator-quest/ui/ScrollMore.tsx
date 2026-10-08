// "There is more below" (M8.1). Words never shrink to fit: a box too small for them scrolls, and this
// cue says so. A still badge with a down arrow at the box's foot while more is below; it goes once the
// learner has scrolled to the end. Drawn, no words (nothing to read), hidden from screen readers (they
// read the whole list anyway). Never moves, never blinks.
import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { eq } from './palette';

/** Props to spread on a ScrollView, and whether more of its content is below the fold. */
export function useScrollMore(onLayout?: (e: LayoutChangeEvent) => void) {
  const [m, set] = useState({ view: 0, content: 0, y: 0 });
  const layout = useCallback(
    (e: LayoutChangeEvent) => {
      const view = e.nativeEvent.layout.height;
      set((s) => (s.view === view ? s : { ...s, view }));
      onLayout?.(e);
    },
    [onLayout],
  );
  const size = useCallback((_w: number, content: number) => set((s) => (s.content === content ? s : { ...s, content })), []);
  const scroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    set((s) => (Math.abs(s.y - y) < 1 ? s : { ...s, y }));
  }, []);
  return { more: moreBelow(m), props: { onLayout: layout, onContentSizeChange: size, onScroll: scroll, scrollEventThrottle: 32 } };
}

/** More content below the fold (pure; tested). */
export const moreBelow = (m: { view: number; content: number; y: number }) => m.view > 0 && m.content - m.view - m.y > 6;

export function MoreCue({ visible, bottom = 6, right = 8 }: { visible: boolean; bottom?: number; right?: number }) {
  if (!visible) return null;
  return (
    <View testID="scroll-more" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.cue, { bottom, right }]}>
      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  cue: { position: 'absolute', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 2, borderColor: eq.amberSoft },
  arrow: { marginTop: 4, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: eq.amberSoft },
});
