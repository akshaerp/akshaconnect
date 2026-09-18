const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('native message notifications use a high-importance Android channel with sound', () => {
  const source = read('src/notifications/nativeNotifications.js');

  expect(source).toMatch(/@notifee\/react-native/);
  expect(source).toMatch(/AndroidImportance\.HIGH/);
  expect(source).toMatch(/sound:\s*['"]default['"]/);
  expect(source).toMatch(/vibration:\s*true/);
  expect(source).toMatch(/displayNotification/);
  expect(source).toMatch(/pressAction/);
});

test('native notifications request permission and retain an in-app fallback', () => {
  const source = read('src/notifications/nativeNotifications.js');
  const app = read('App.jsx');

  expect(source).toMatch(/requestPermission/);
  expect(source).toMatch(/AuthorizationStatus\.DENIED/);
  expect(app).toMatch(/displayNativeMessageNotification/);
  expect(app).toMatch(/if \(!displayed\) setNotificationToast/);
  expect(app).toMatch(/subscribeToNativeNotificationPress/);
});
