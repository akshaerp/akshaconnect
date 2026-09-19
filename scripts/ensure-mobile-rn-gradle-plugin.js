'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_VERSION = '0.87.0';
const repoRoot = path.resolve(__dirname, '..');
const mobileNodeModules = path.join(
  repoRoot,
  'apps',
  'mobile',
  'node_modules'
);

function packageVersion(directory) {
  const file = path.join(directory, 'package.json');
  if (!fs.existsSync(file)) return '';
  return String(
    JSON.parse(fs.readFileSync(file, 'utf8')).version || ''
  );
}

function ensureDirectoryLink({
  label,
  relativePackagePath,
  validate,
}) {
  const destination = path.join(
    mobileNodeModules,
    ...relativePackagePath
  );

  function valid(directory) {
    if (!fs.existsSync(directory)) return false;
    if (packageVersion(directory) !== EXPECTED_VERSION) {
      return false;
    }
    return validate(directory);
  }

  if (valid(destination)) {
    console.log(
      `AkshaConnect ${label} already local: ${destination}`
    );
    return;
  }

  const candidates = [
    path.join(
      repoRoot,
      'node_modules',
      ...relativePackagePath
    ),
    path.join(
      mobileNodeModules,
      'react-native',
      'node_modules',
      ...relativePackagePath
    ),
  ];

  const source = candidates.find(valid);

  if (!source) {
    throw new Error(
      `${label} ${EXPECTED_VERSION} was not found in the installed npm dependency tree`
    );
  }

  fs.mkdirSync(
    path.dirname(destination),
    { recursive: true }
  );

  if (fs.existsSync(destination)) {
    fs.rmSync(
      destination,
      { recursive: true, force: true }
    );
  }

  fs.symlinkSync(
    source,
    destination,
    process.platform === 'win32'
      ? 'junction'
      : 'dir'
  );

  if (!valid(destination)) {
    throw new Error(
      `${label} local link verification failed`
    );
  }

  console.log(`AkshaConnect ${label} link ready`);
  console.log(`  local   : ${destination}`);
  console.log(`  source  : ${fs.realpathSync(destination)}`);
  console.log(`  version : ${packageVersion(destination)}`);
}

ensureDirectoryLink({
  label: 'mobile RN Gradle plugin',
  relativePackagePath: [
    '@react-native',
    'gradle-plugin',
  ],
  validate(directory) {
    const settingsPlugin = path.join(
      directory,
      'settings-plugin',
      'build.gradle.kts'
    );

    return (
      fs.existsSync(settingsPlugin) &&
      fs
        .readFileSync(settingsPlugin, 'utf8')
        .includes('com.facebook.react.settings')
    );
  },
});

ensureDirectoryLink({
  label: 'mobile RN codegen',
  relativePackagePath: [
    '@react-native',
    'codegen',
  ],
  validate(directory) {
    const cli = path.join(
      directory,
      'lib',
      'cli',
      'combine',
      'combine-js-to-schema-cli.js'
    );

    return fs.existsSync(cli);
  },
});
