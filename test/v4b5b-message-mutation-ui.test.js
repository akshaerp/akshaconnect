'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

test(
  'V4B5B web and mobile clients call bounded message edit/delete endpoints',
  () => {
    const webApi = read(
      'apps/web/src/api.js'
    );

    const mobileApi = read(
      'apps/mobile/src/api/client.js'
    );

    for (const source of [
      webApi,
      mobileApi,
    ]) {
      assert.match(
        source,
        /export function editMessage/
      );

      assert.match(
        source,
        /method:\s*'PUT'/
      );

      assert.match(
        source,
        /export function deleteMessage/
      );

      assert.match(
        source,
        /method:\s*'DELETE'/
      );

      assert.match(
        source,
        /body_text:\s*bodyText/
      );
    }
  }
);

test(
  'V4B5B web shows own-message edit/delete controls, edited marker and deleted tombstone',
  () => {
    const app = read(
      'apps/web/src/App.jsx'
    );

    const css = read(
      'apps/web/src/styles.css'
    );

    assert.match(
      app,
      /handleSaveEditedMessage/
    );

    assert.match(
      app,
      /handleDeleteOwnedMessage/
    );

    assert.match(
      app,
      /Message deleted/
    );

    assert.match(
      app,
      /message\.edited_at/
    );

    assert.match(
      css,
      /message-own-actions/
    );

    assert.match(
      css,
      /message-row:hover \.message-own-actions/
    );

    assert.match(
      css,
      /deleted-message-text/
    );
  }
);

test(
  'V4B5B web and mobile realtime reconcile update/delete without treating them as new notifications',
  () => {
    const web = read(
      'apps/web/src/App.jsx'
    );

    const mobileApp = read(
      'apps/mobile/App.jsx'
    );

    const mobileScreen = read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );

    assert.match(
      web,
      /'message\.updated'/
    );

    assert.match(
      web,
      /'message\.deleted'/
    );

    assert.match(
      web,
      /event\.type !==\s*'message\.created'/
    );

    assert.match(
      mobileApp,
      /'message\.updated'/
    );

    assert.match(
      mobileApp,
      /'message\.deleted'/
    );

    assert.match(
      mobileApp,
      /payload\.type !==\s*'message\.created'/
    );

    assert.match(
      mobileScreen,
      /const mutations = pending/
    );
  }
);

test(
  'V4B5B mobile exposes long-press actions and composer edit mode',
  () => {
    const screen = read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );

    assert.match(
      screen,
      /Alert\.alert\(\s*'Message actions'/
    );

    assert.match(
      screen,
      /onLongPress/
    );

    assert.match(
      screen,
      /Long press for actions/
    );

    assert.match(
      screen,
      /Editing message/
    );

    assert.match(
      screen,
      /editingMessage\s*\?\s*\(/
    );

    assert.match(
      screen,
      />\s*Save\s*</
    );

    assert.match(
      screen,
      />\s*Send\s*</
    );

    assert.match(
      screen,
      /deleteOwnedMessage/
    );

    assert.match(
      screen,
      /Message deleted/
    );

    assert.match(
      screen,
      /message\.edited_at/
    );
  }
);

test(
  'V4B5B retains attachment actions and disables attachment picking during text edit',
  () => {
    const screen = read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );

    // V14.1 keeps durable attachment actions while removing the OEM-specific
    // VIEW_DOWNLOADS launcher. Saved MediaStore content URIs remain directly
    // reusable through the existing Open action.
    assert.doesNotMatch(
      screen,
      /android\.intent\.action\.VIEW_DOWNLOADS/
    );

    assert.doesNotMatch(
      screen,
      /Linking\.sendIntent/
    );

    assert.match(
      screen,
      /saved\?\.contentUri/
    );

    assert.match(
      screen,
      /expandedAttachmentId/
    );

    assert.match(
      screen,
      /Boolean\(editingMessage\) \|\|\s*sending \|\|\s*pickingAttachments/
    );
  }
);

test(
  'V4B5B bundles the deferred lower splash wave into the meaningful mobile build',
  () => {
    const app = read(
      'apps/mobile/App.jsx'
    );

    assert.match(
      app,
      /splashNavy:[\s\S]*backgroundColor:\s*'#0879E7'/
    );
  }
);
