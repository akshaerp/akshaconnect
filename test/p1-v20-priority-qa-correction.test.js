'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root =
  path.resolve(
    __dirname,
    '..'
  );

const read =
  (rel) =>
    fs.readFileSync(
      path.join(root, rel),
      'utf8'
    );

test(
  'V20 mention lookup uses stable existing lists and local filtering instead of per-letter candidate requests',
  () => {
    const mobile =
      read(
        'apps/mobile/src/screens/ConversationScreen.jsx'
      );

    const thread =
      read(
        'apps/mobile/src/screens/ThreadModal.jsx'
      );

    const web =
      read(
        'apps/web/src/App.jsx'
      );

    assert.match(
      mobile,
      /mentionCandidateCacheRef/
    );

    assert.match(
      mobile,
      /listChannelMembers/
    );

    assert.match(
      mobile,
      /listChannels/
    );

    assert.match(
      thread,
      /mentionCandidateCacheRef/
    );

    assert.match(
      web,
      /mentionCandidateCacheRef/
    );

    assert.doesNotMatch(
      mobile,
      /searchMentionCandidates\(/,
    );

    assert.doesNotMatch(
      thread,
      /searchMentionCandidates\(/,
    );

    assert.doesNotMatch(
      web,
      /searchMentionCandidates\(/,
    );
  }
);

test(
  'V20 image viewer is true full-screen with zoom, forward, reactions and menu actions',
  () => {
    const viewer =
      read(
        'apps/mobile/src/screens/ImageViewerModal.jsx'
      );

    const main =
      read(
        'apps/mobile/src/screens/ConversationScreen.jsx'
      );

    assert.match(
      viewer,
      /Pinch or double-tap to zoom/
    );

    assert.match(
      viewer,
      /onForward/
    );

    assert.match(
      viewer,
      /onReact/
    );

    assert.match(
      viewer,
      /onDownload\?\.\(\)/
    );

    assert.match(
      viewer,
      /['"]Download['"]/
    );

    assert.match(
      viewer,
      /onShare\?\.\(\)/
    );

    assert.match(
      viewer,
      /['"]Share['"]/
    );

    assert.match(
      viewer,
      />\s*Details\s*</
    );

    assert.doesNotMatch(
      viewer,
      /Number\(index\)[\s\S]{0,220}\sof\s/
    );

    assert.match(
      viewer,
      /backgroundColor:\s*'#000000'/
    );

    assert.match(
      main,
      /handleForwardPreviewAttachment/
    );

    assert.match(
      main,
      /handleReactPreviewAttachment/
    );
  }
);

test(
  'V20 Android media sharing is registered through FileProvider',
  () => {
    const module =
      read(
        'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectMediaModule.kt'
      );

    const application =
      read(
        'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt'
      );

    const paths =
      read(
        'apps/mobile/android/app/src/main/res/xml/akshaconnect_clipboard_paths.xml'
      );

    assert.match(
      module,
      /Intent\.ACTION_SEND/
    );

    assert.match(
      application,
      /AkshaConnectMediaPackage/
    );

    assert.match(
      paths,
      /akshaconnect-share/
    );
  }
);
