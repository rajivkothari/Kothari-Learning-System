// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Developer-only code stays out of production bundles unless explicitly requested at build
// time. Development bundles always include it. The runtime flags in src/config/flags.ts still
// apply; this makes sure the code is not even in the bundle (scripts/check-bundle.js checks).
//   Device Lab:      EXPO_PUBLIC_DEVICE_LAB=1
//   Developer tools: EXPO_PUBLIC_DEV_TOOLS=1 (set by `npm run web:export`)
const production = process.env.NODE_ENV === 'production';
const stubs = [];
if (production && process.env.EXPO_PUBLIC_DEVICE_LAB !== '1') {
  stubs.push([/(^|\/)dev\/device-lab\/DeviceLabScreen$/, path.join(__dirname, 'src/dev/DeviceLabStub.tsx')]);
}
if (production && process.env.EXPO_PUBLIC_DEV_TOOLS !== '1') {
  stubs.push([/(^|\/)devtools\/DevToolsShell$/, path.join(__dirname, 'src/devtools/DevToolsStub.tsx')]);
  stubs.push([/(^|\/)devtools\/QuestArtLaunch$/, path.join(__dirname, 'src/devtools/QuestArtLaunchStub.tsx')]);
}

if (stubs.length) {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    for (const [pattern, stub] of stubs) if (pattern.test(moduleName)) return { type: 'sourceFile', filePath: stub };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
