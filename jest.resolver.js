// Composes jest-expo's resolver with the Jest resolver shipped by react-native-worklets,
// which skips `.native` files so worklets uses its JS implementation under Jest.
const presetResolver = require(require('jest-expo/jest-preset').resolver);

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  if (options.basedir.includes('react-native-worklets') || request.includes('react-native-worklets')) {
    options = { ...options, extensions: options.extensions?.filter((ext) => !ext.includes('native')) };
  }
  return presetResolver(request, options);
};
