// Global Jest setup. Native rendering and audio cannot run in Node, so these
// tests prove module wiring and React rendering only. Device behaviour is verified
// with the physical test plan in docs/DEVICE_LAB.md.
import 'react-native-gesture-handler/jestSetup';
import { setUpTests } from 'react-native-reanimated';

setUpTests();

// Library-provided mock: supplies fixed insets instead of waiting for native ones.
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

// Minimal Skia stand-in: every drawing component renders nothing, factories return
// inert objects. Enough to mount screens without a GPU or CanvasKit.
jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Null = () => null;
  const Canvas = ({ children, ...props }: { children?: React.ReactNode }) => React.createElement(View, props, children);
  const path = { moveTo: () => path, lineTo: () => path, close: () => path };
  const builder = { moveTo: () => builder, lineTo: () => builder, close: () => builder, build: () => path, detach: () => path };
  return {
    __esModule: true,
    Canvas,
    Group: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    Rect: Null,
    RoundedRect: Null,
    Circle: Null,
    Line: Null,
    Path: Null,
    Text: Null,
    LinearGradient: Null,
    BlurMask: Null,
    DashPathEffect: Null,
    // Images: a loaded image is a plain object carrying its source, drawn as a tagged View, so tests
    // can see which art was drawn. A null source, or one starting "fail:", never loads (as a decode
    // error would), so the vector fallback stays.
    Image: ({ image }: { image: { source: unknown } | null }) => (image ? React.createElement(View, { testID: 'skia-image', accessibilityHint: String(image.source) }) : null),
    loadData: jest.fn(async (source: unknown, factory: (data: unknown) => unknown) => (source === null || source === undefined || String(source).startsWith('fail:') ? null : factory({ source }))),
    vec: (x: number, y: number) => ({ x, y }),
    matchFont: () => null,
    usePathValue: () => ({ value: path, get: () => path }),
    Skia: { Image: { MakeImageFromEncoded: (data: { source: unknown }) => ({ source: data.source, width: () => 1, height: () => 1 }) }, Path: { Make: () => path, MakeFromSVGString: () => path }, PathBuilder: { Make: () => builder }, XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }) },
  };
});
