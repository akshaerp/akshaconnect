const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

test('V4B1R1 Metro resolves both mobile-local and hoisted workspace dependencies', () => {
  const metro = read(
    'apps/mobile/metro.config.js'
  );

  assert.match(
    metro,
    /const workspaceRoot = path\.resolve\(__dirname, '\.\.\/\.\.'\)/
  );

  assert.match(
    metro,
    /watchFolders:\s*\[workspaceRoot\]/
  );

  assert.match(
    metro,
    /path\.resolve\(__dirname, 'node_modules'\)/
  );

  assert.match(
    metro,
    /path\.resolve\(workspaceRoot, 'node_modules'\)/
  );

  assert.doesNotMatch(
    metro,
    /disableHierarchicalLookup:\s*true/
  );
});

test('V4B1R1 keeps Android settings canonical while Metro owns JS workspace resolution', () => {
  const settings = read(
    'apps/mobile/android/settings.gradle'
  );

  assert.match(
    settings,
    /includeBuild\("\.\.\/node_modules\/@react-native\/gradle-plugin"\)/
  );

  assert.doesNotMatch(
    settings,
    /\.\.\/\.\.\/\.\.\/node_modules\/@react-native\/gradle-plugin/
  );
});
