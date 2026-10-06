// Measures the space it is given and fits the logical stage into it. Re-runs on
// every layout change (rotation, Split View, Stage Manager resize). Nothing caches
// startup dimensions.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { LAB_STAGE, fitStage, type Size, type StageFit } from '../../../presentation/layout/stageLayout';

interface Props {
  children: (args: { fit: StageFit; container: Size }) => ReactNode;
}

export function StageView({ children }: Props) {
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== container.width || height !== container.height) setContainer({ width, height });
  };

  const fit = fitStage(container, LAB_STAGE);

  return (
    <View style={styles.fill} onLayout={onLayout} testID="stage-view">
      {fit.scale > 0 ? children({ fit, container }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
});
