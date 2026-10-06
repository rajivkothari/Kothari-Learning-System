// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep the developer-only Device Lab (code and its audio assets) out of production
// bundles unless EXPO_PUBLIC_DEVICE_LAB=1 is set at build time. Development bundles
// always include it. The runtime flag in src/config/flags.ts still applies.
const includeDeviceLab = process.env.NODE_ENV !== 'production' || process.env.EXPO_PUBLIC_DEVICE_LAB === '1';
const LAB_ENTRY = /(^|\/)dev\/device-lab\/DeviceLabScreen$/;
const LAB_STUB = path.join(__dirname, 'src/dev/DeviceLabStub.tsx');

if (!includeDeviceLab) {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (LAB_ENTRY.test(moduleName)) return { type: 'sourceFile', filePath: LAB_STUB };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
