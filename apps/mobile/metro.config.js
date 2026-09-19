const path = require('path');
const {
  getDefaultConfig,
  mergeConfig,
} = require('@react-native/metro-config');

/**
 * AkshaConnect mobile lives inside an npm-workspaces monorepo.
 *
 * React Native packages can be installed either in apps/mobile/node_modules
 * or hoisted to the repository-root node_modules. Metro's project root is
 * apps/mobile, so explicitly expose both locations for deterministic release
 * bundling after a clean npm install.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const workspaceRoot = path.resolve(__dirname, '../..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  config
);
