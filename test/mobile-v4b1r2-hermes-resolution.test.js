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

test('V4B1R2 resolves Hermes from the installed hermes-compiler package', () => {
  const gradle = read(
    'apps/mobile/android/app/build.gradle'
  );

  assert.match(
    gradle,
    /hermesCompilerPackageRoot/
  );

  assert.match(
    gradle,
    /node_modules\/hermes-compiler\/hermesc/
  );

  assert.match(
    gradle,
    /win64-bin\/hermesc\.exe/
  );

  assert.match(
    gradle,
    /osx-bin\/hermesc/
  );

  assert.match(
    gradle,
    /linux64-bin\/hermesc/
  );

  assert.match(
    gradle,
    /hermesCommand\s*=\s*file/
  );

  assert.match(
    gradle,
    /System\.getProperty\("os\.name"\)/
  );
});

test('V4B1R2 keeps Hermes enabled and does not fall back to JSC', () => {
  const properties = read(
    'apps/mobile/android/gradle.properties'
  );

  const gradle = read(
    'apps/mobile/android/app/build.gradle'
  );

  assert.match(
    properties,
    /^hermesEnabled=true$/m
  );

  assert.match(
    gradle,
    /implementation\("com\.facebook\.react:hermes-android"\)/
  );
});
