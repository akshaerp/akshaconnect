const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(process.cwd(), 'apps', 'mobile', 'App.jsx');
const source = fs.readFileSync(appPath, 'utf8');

test('mobile realtime tolerates transient Android AppState changes', () => {
  assert.match(source, /const APP_BACKGROUND_GRACE_MS = 2000;/);
  assert.match(source, /const \[stableAppActive, setStableAppActive\] = useState\(/);
  assert.match(source, /const appBackgroundTimerRef = useRef\(null\);/);
  assert.match(source, /Platform\.OS !== 'android'[\s\S]*setStableAppActive\(false\)/);
  assert.match(source, /appBackgroundTimerRef\.current = setTimeout\([\s\S]*APP_BACKGROUND_GRACE_MS\)/);

  const realtimeStart = source.indexOf('const token = session?.access_token;');
  const realtimeEnd = source.indexOf('const openFromNativeNotification', realtimeStart);
  assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart, 'realtime effect not found');
  const realtimeBlock = source.slice(realtimeStart, realtimeEnd);
  assert.match(realtimeBlock, /if \(!stableAppActive\)/);
  assert.doesNotMatch(realtimeBlock, /if \(appState !== 'active'\)/);
  assert.match(
    realtimeBlock,
    /\[refreshUnreadCounts, serverUrl, session\?\.access_token, stableAppActive\]/
  );
});

test('resume refresh and push registration use stabilized foreground state', () => {
  assert.match(
    source,
    /if \(\s*!stableAppActive \|\|\s*!session\?\.access_token \|\|\s*!deviceCredential\?\.deviceToken/
  );
  assert.match(
    source,
    /\[deviceCredential\?\.deviceToken, refreshDeviceAccess, session\?\.access_token, session\?\.expires_at, stableAppActive\]/
  );
  assert.match(
    source,
    /if \(\s*!stableAppActive \|\|\s*!serverUrl \|\|\s*!session\?\.access_token/
  );
  assert.match(
    source,
    /\[deviceCredential\?\.deviceToken, serverUrl, session\?\.access_token, stableAppActive\]/
  );
});

test('SSO Android focus and retained callback recovery remains present', () => {
  assert.match(source, /scheduleRetainedMobileAuthRead/);
  assert.match(source, /AppState\.addEventListener\('focus', handleMobileAuthFocus\)/);
  assert.match(source, /bridge\?\.getPendingCallback/);
});
