// Developer diagnostics. Shows what is reliably knowable on device and labels
// approximations as such. "Share report" exports a text snapshot through the OS
// share sheet (no network, no extra dependency) for pasting into test notes.
import { useState } from 'react';
import { Dimensions, PixelRatio, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeOrientation, type Size } from '../../../presentation/layout/stageLayout';
import { LabButton } from '../components/LabButton';
import { useLab, type LabState } from '../labStore';
import { lab } from '../theme';
import { median, type FrameWindow } from './frameStats';

declare const HermesInternal: unknown;

function engineInfo(): { hermes: boolean; fabric: boolean } {
  const g = globalThis as { nativeFabricUIManager?: unknown };
  return { hermes: typeof HermesInternal !== 'undefined' && HermesInternal !== null, fabric: g.nativeFabricUIManager != null };
}

function deviceLine(): string {
  const c = Platform.constants as Record<string, unknown>;
  if (Platform.OS === 'android') {
    return `${String(c.Manufacturer ?? '?')} ${String(c.Model ?? '?')} | Android ${String(c.Release ?? '?')} (API ${String(Platform.Version)})`;
  }
  return `${String(c.systemName ?? Platform.OS)} ${String(c.osVersion ?? Platform.Version)} | idiom ${String(c.interfaceIdiom ?? '?')}`;
}

function fmtFrames(w: FrameWindow | null): string {
  if (!w || w.frames === 0) return 'collecting...';
  return `${w.fps.toFixed(0)} fps avg | p95 ${w.p95Ms.toFixed(1)} ms | worst ${w.maxMs.toFixed(0)} ms | slow ${w.slowFrames}/${w.frames}`;
}

function fmtMs(samples: number[]): string {
  if (samples.length === 0) return 'n/a';
  return `median ${median(samples).toFixed(1)} ms | last ${samples[samples.length - 1]!.toFixed(1)} ms | n=${samples.length}`;
}

export function buildReport(state: LabState, window: Size, insets: { top: number; right: number; bottom: number; left: number }): string {
  const screen = Dimensions.get('screen');
  const { orientation, aspect } = describeOrientation(window);
  const eng = engineInfo();
  return [
    `Device Lab report ${new Date().toISOString()}`,
    `Device: ${deviceLine()}`,
    `Engine: Hermes ${eng.hermes ? 'yes' : 'no'} | Fabric ${eng.fabric ? 'yes' : 'no'} | ${__DEV__ ? 'DEBUG build (not representative for perf)' : 'release build'}`,
    `Window: ${window.width.toFixed(0)} x ${window.height.toFixed(0)} pt | ${orientation} | aspect ${aspect.toFixed(3)}`,
    `Screen: ${screen.width.toFixed(0)} x ${screen.height.toFixed(0)} pt | scale ${PixelRatio.get()} | fontScale ${PixelRatio.getFontScale()}`,
    `Safe area: t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}`,
    `Scenario: ${state.scenario}`,
    `UI thread frames: ${fmtFrames(state.uiFrames)}`,
    `JS thread frames: ${fmtFrames(state.jsFrames)}`,
    `Press to next UI frame (approx): ${fmtMs(state.pressToFrameMs)}`,
    `SQLite tap write: ${fmtMs(state.dbWriteMs)}`,
    `Audio: ${state.audio.status} | play call ${state.audio.lastPlayCallMs?.toFixed(1) ?? 'n/a'} ms | narration status ${state.audio.narrationStatusMs?.toFixed(0) ?? 'n/a'} ms${state.audio.error ? ` | error ${state.audio.error}` : ''}`,
    `SQLite: ${state.storage.status} | launches ${state.storage.summary?.launches ?? '?'} | events ${state.storage.summary?.events ?? '?'} | journal ${state.storage.summary?.journalMode ?? '?'}${state.storage.error ? ` | error ${state.storage.error}` : ''}`,
  ].join('\n');
}

export function DiagnosticsPanel({ window, onClose }: { window: Size; onClose: () => void }) {
  const state = useLab((s) => s);
  const insets = useSafeAreaInsets();
  const [shareError, setShareError] = useState<string | null>(null);
  const report = buildReport(state, window, insets);

  return (
    <View style={styles.panel} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Diagnostics</Text>
        <Text style={styles.mono} selectable>
          {report}
        </Text>
        <Text style={styles.note}>
          Frame numbers come from callbacks, not the GPU or display. Debug builds run much slower than release builds. Confirm with platform
          tools and slow-motion video before drawing conclusions.
        </Text>
        {shareError ? <Text style={styles.error}>{shareError}</Text> : null}
        <View style={styles.row}>
          <LabButton
            label="Share report"
            onPress={() => {
              Share.share({ message: report }).catch((e: unknown) => setShareError(e instanceof Error ? e.message : String(e)));
            }}
            size={64}
          />
          <LabButton label="Close" onPress={onClose} size={64} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: 12,
    top: 12,
    bottom: 12,
    width: 420,
    maxWidth: '94%',
    backgroundColor: 'rgba(8, 12, 20, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lab.panelBorder,
  },
  content: { padding: 16, gap: 12 },
  title: { color: lab.text, fontSize: 20, fontWeight: '800' },
  mono: { color: lab.text, fontSize: 13, lineHeight: 19, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  note: { color: lab.textDim, fontSize: 13 },
  error: { color: lab.danger, fontSize: 13 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
});
