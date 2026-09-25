const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function walk(relativePath) {
  const start = path.join(ROOT, relativePath);
  const out = [];

  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    const full = path.join(start, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(path.relative(ROOT, full)));
    } else {
      out.push(path.relative(ROOT, full));
    }
  }

  return out;
}

test('P1-V8A mobile native identity is deterministic', () => {
  const appJson = JSON.parse(read('apps/mobile/app.json'));
  const buildGradle = read('apps/mobile/android/app/build.gradle');
  const activity = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainActivity.kt'
  );
  const pbx = read(
    'apps/mobile/ios/AkshaConnectMobile.xcodeproj/project.pbxproj'
  );

  assert.equal(appJson.name, 'AkshaConnectMobile');
  assert.equal(appJson.displayName, 'AkshaConnect');
  assert.match(buildGradle, /namespace "com\.akshaerp\.akshaconnect"/);
  assert.match(buildGradle, /applicationId "com\.akshaerp\.akshaconnect"/);
  assert.match(activity, /^package com\.akshaerp\.akshaconnect/m);
  assert.match(
    activity,
    /getMainComponentName\(\): String = "AkshaConnectMobile"/
  );
  assert.match(
    pbx,
    /PRODUCT_BUNDLE_IDENTIFIER = "com\.akshaerp\.akshaconnect";/
  );
  assert.equal(
    exists(
      'apps/mobile/android/app/src/main/java/com/com.akshaerp.akshaconnect/MainActivity.kt'
    ),
    false
  );
});

test('P1-V8A mobile package stays JavaScript-first on React Native 0.87', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));

  assert.equal(pkg.dependencies['react-native'], '0.87.0');
  assert.equal(pkg.dependencies.react, '19.2.3');
  assert.equal(pkg.devDependencies.typescript, undefined);
  assert.equal(pkg.devDependencies['@react-native/typescript-config'], undefined);
  assert.equal(exists('apps/mobile/App.tsx'), false);
  assert.equal(exists('apps/mobile/tsconfig.json'), false);
});

test('P1-V8A mobile uses provider-neutral AkshaConnect HTTP contracts', () => {
  const client = read('apps/mobile/src/api/client.js');

  assert.match(client, /\/api\/v1\/auth\/local\/login/);
  assert.match(client, /\/api\/v1\/auth\/logout/);
  assert.match(client, /\/api\/v1\/channels/);
  assert.match(client, /\/api\/v1\/direct-messages/);
  assert.match(client, /normalizeBaseUrl/);
  assert.doesNotMatch(client, /AKSHAERP_|module_code|function_code|app_functions/i);
});

test('P1-V8A V1 never persists bearer credentials in plaintext mobile storage', () => {
  const sources = ['apps/mobile/App.jsx', ...walk('apps/mobile/src')];
  const combined = sources.map(read).join('\n');

  assert.doesNotMatch(
    combined,
    /AsyncStorage|sessionStorage|localStorage|access_token\s*[:=].*storage/i
  );
});

test('V10A real product screens use organization discovery before company authentication', () => {
  const app = read('apps/mobile/App.jsx');
  const login = read('apps/mobile/src/screens/LoginScreen.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');

  assert.match(app, /LoginScreen/);
  assert.match(app, /HomeScreen/);
  assert.match(app, /discoverMobileOrganizations/);
  assert.match(app, /exchangeMobileAuthorization/);

  assert.match(login, /Find your organization/);
  assert.match(login, /Work email/);
  assert.match(login, /Choose your organization/);
  assert.match(login, /ONE APP · ALL YOUR COMPANIES/);
  assert.doesNotMatch(login, /Server URL/);
  assert.doesNotMatch(login, /Password/);

  assert.match(home, /Channels/);
  assert.match(home, /Direct messages/);
});
