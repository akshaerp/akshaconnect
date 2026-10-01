'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const parser =
  require('@babel/parser');

const root =
  path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8',
  );
}

test(
  'V17-C3 Settings exposes selectable quick status messages with automatic presence explained separately',
  () => {
    const settings =
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      );

    assert.match(
      settings,
      /STATUS_PRESETS/
    );

    for (
      const label of [
        'Away',
        'Busy',
        'In a meeting',
        'Working from home',
        'Sick',
        'On leave',
      ]
    ) {
      assert.ok(
        settings.includes(label)
      );
    }

    assert.match(
      settings,
      /Online, Away and Offline are automatic/
    );

    assert.match(
      settings,
      /accessibilityState=\{\{ selected \}\}/
    );

    assert.match(
      settings,
      /setStatusText\(preset\.label\)/
    );
  }
);

test(
  'V17-C3 Settings uses the Android native date and time picker instead of manual date text',
  () => {
    const settings =
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      );

    assert.match(
      settings,
      /AkshaConnectDateTimePicker/
    );

    assert.match(
      settings,
      /openCustomExpiryPicker/
    );

    assert.match(
      settings,
      /Choose date & time/
    );

    assert.doesNotMatch(
      settings,
      /Custom: YYYY-MM-DD HH:MM/
    );

    assert.doesNotMatch(
      settings,
      /customExpiryFromLocalText/
    );
  }
);

test(
  'V17-C3 Android native picker uses DatePickerDialog then TimePickerDialog without an added package dependency',
  () => {
    const moduleSource =
      read(
        'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectDateTimePickerModule.kt',
      );

    const packageSource =
      read(
        'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectDateTimePickerPackage.kt',
      );

    const application =
      read(
        'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt',
      );

    const packageJson =
      read(
        'apps/mobile/package.json',
      );

    assert.match(
      moduleSource,
      /DatePickerDialog/
    );

    assert.match(
      moduleSource,
      /reactApplicationContext\.currentActivity/
    );

    assert.doesNotMatch(
      moduleSource,
      /val activity = currentActivity/
    );

    assert.match(
      moduleSource,
      /TimePickerDialog/
    );

    assert.match(
      moduleSource,
      /DateFormat\.is24HourFormat/
    );

    assert.match(
      moduleSource,
      /datePicker\.minDate/
    );

    assert.match(
      packageSource,
      /AkshaConnectDateTimePickerModule/
    );

    assert.match(
      application,
      /add\(AkshaConnectDateTimePickerPackage\(\)\)/
    );

    assert.doesNotMatch(
      packageJson,
      /datetimepicker/i
    );
  }
);

test(
  'V17-C3 preserves the C2 Settings palette and six-line composer contracts',
  () => {
    const settings =
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      );

    const chrome =
      read(
        'apps/mobile/src/screens/ConversationChrome.jsx',
      );

    assert.match(
      settings,
      /palette\.surface/
    );

    assert.match(
      settings,
      /palette\.textPrimary/
    );

    assert.doesNotMatch(
      settings,
      /darkMode \? '#F7FAFD'/
    );

    assert.match(
      chrome,
      /CONVERSATION_COMPOSER_MAX_LINES = 6/
    );
  }
);

test(
  'V17-C3 Settings source parses as React Native JSX module',
  () => {
    parser.parse(
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      ),
      {
        sourceType: 'module',
        plugins: ['jsx'],
      },
    );
  }
);
