'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const {
  createRequestHandler,
} = require('../services/api/src/app');
const {
  createMobileVersionPolicyFromEnv,
} = require('../services/api/src/mobile/mobileVersionPolicy');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function withServer(options, run) {
  const server = http.createServer(createRequestHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('R8B.3 server version policy supports optional and mandatory Android releases', () => {
  const policy = createMobileVersionPolicyFromEnv({
    AKSHACONNECT_ANDROID_LATEST_VERSION_CODE: '14',
    AKSHACONNECT_ANDROID_LATEST_VERSION_NAME: '0.3.0-v14',
    AKSHACONNECT_ANDROID_MINIMUM_VERSION_CODE: '13',
    AKSHACONNECT_ANDROID_RELEASE_NOTES: 'Calling and stability improvements.',
    AKSHACONNECT_ANDROID_UPDATE_URL:
      'https://play.google.com/store/apps/details?id=com.akshaerp.akshaconnect',
  });

  assert.deepEqual(policy('ANDROID'), {
    platform: 'ANDROID',
    supported: true,
    latest_version_code: 14,
    latest_version_name: '0.3.0-v14',
    minimum_version_code: 13,
    update_url:
      'https://play.google.com/store/apps/details?id=com.akshaerp.akshaconnect',
    release_notes: 'Calling and stability improvements.',
  });

  assert.equal(policy('IOS').supported, false);
});

test('R8B.3 public app-version endpoint does not require authentication', async () => {
  await withServer(
    {
      mobileVersionPolicy: (platform) => ({
        platform,
        supported: true,
        latest_version_code: 12,
        latest_version_name: '0.3.0-v12',
        minimum_version_code: 12,
        update_url: 'https://example.test/update',
        release_notes: 'Current internal release.',
      }),
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/mobile/app-version?platform=ANDROID`
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.platform, 'ANDROID');
      assert.equal(payload.latest_version_code, 12);
      assert.equal(payload.minimum_version_code, 12);
    }
  );
});

test('R8B.3 mobile client, app shell and settings screen expose update management', () => {
  const api = read('apps/mobile/src/api/client.js');
  const app = read('apps/mobile/App.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const settings = read('apps/mobile/src/screens/SettingsScreen.jsx');
  const appInfo = read('apps/mobile/src/platform/appInfo.js');

  assert.match(api, /getMobileAppVersionPolicy/);
  assert.match(api, /\/api\/v1\/mobile\/app-version/);

  assert.match(app, /getInstalledAppVersion/);
  assert.match(app, /startupUpdateCheckStartedRef/);
  assert.match(app, /mobileUpdateStatus/);
  assert.match(app, /Update required/);
  assert.match(app, /Update available/);
  assert.match(app, /Linking\.openURL\(updateUrl\)/);
  assert.match(app, /Linking\.openSettings\(\)/);

  assert.match(home, /label="Settings"/);
  assert.match(home, /<SettingsScreen/);

  assert.match(settings, /Check for updates/);
  assert.match(settings, /Automatic update checks/);
  assert.match(settings, /App permissions & notifications/);
  assert.match(settings, /Manage organizations/);
  assert.match(settings, /Sign out/);

  assert.match(appInfo, /NativeModules\.AkshaConnectAppInfo/);
});

test('R8B.3 installed version survives a remote policy lookup failure', () => {
  const app = read('apps/mobile/App.jsx');
  const versionRead = app.indexOf('const version = await getInstalledAppVersion();');
  const versionSet = app.indexOf('setAppVersion(normalizedVersion);');
  const policyRead = app.indexOf('const policy = await getMobileAppVersionPolicy(');

  assert.ok(versionRead >= 0, 'installed version read must exist');
  assert.ok(versionSet > versionRead, 'installed version must be stored after native read');
  assert.ok(policyRead > versionSet, 'remote policy lookup must happen after local version is stored');
  assert.doesNotMatch(
    app,
    /Promise\.all\(\[[\s\S]*getInstalledAppVersion\(\)[\s\S]*getMobileAppVersionPolicy/
  );
});

test('R8B.3 Android native app-info bridge returns actual package version', () => {
  const application = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt'
  );
  const module = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectAppInfoModule.kt'
  );
  const pkg = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectAppInfoPackage.kt'
  );

  assert.match(application, /add\(AkshaConnectAppInfoPackage\(\)\)/);
  assert.match(module, /getName\(\): String = "AkshaConnectAppInfo"/);
  assert.match(module, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.P/);
  assert.match(module, /packageInfo\.longVersionCode/);
  assert.match(module, /packageInfo\.versionCode\.toLong\(\)/);
  assert.match(module, /packageInfo\.versionName/);
  assert.match(pkg, /AkshaConnectAppInfoModule\(reactContext\)/);
});

test('R8B.3 does not change the accepted V12 Android release number', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 12/);
  assert.match(gradle, /versionName "0\.3\.0-v12"/);
});
