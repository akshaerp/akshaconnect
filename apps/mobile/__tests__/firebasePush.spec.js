'use strict';

const fs =
  require('node:fs');

describe(
  'V3D1B Firebase push integration',
  () => {
    test(
      'handles token lifecycle and notification opening',
      () => {
        const source =
          fs.readFileSync(
            'src/notifications/firebasePush.js',
            'utf8'
          );

        expect(source)
          .toMatch(
            /getToken/
          );

        expect(source)
          .toMatch(
            /onTokenRefresh/
          );

        expect(source)
          .toMatch(
            /onNotificationOpenedApp/
          );

        expect(source)
          .toMatch(
            /getInitialNotification/
          );
      }
    );

    test(
      'App binds FCM token to authenticated device session',
      () => {
        const source =
          fs.readFileSync(
            'App.jsx',
            'utf8'
          );

        expect(source)
          .toMatch(
            /registerPush/
          );

        expect(source)
          .toMatch(
            /deviceCredential\.deviceToken/
          );

        expect(source)
          .toMatch(
            /pendingPushConversationId/
          );
      }
    );
  }
);