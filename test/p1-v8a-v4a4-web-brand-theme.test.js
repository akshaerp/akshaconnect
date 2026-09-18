'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('V4A4 web uses approved mark and wordmark assets', () => {
  const app = read('apps/web/src/App.jsx');

  assert.match(app, /\/brand\/akshaconnect-mark\.png/);
  assert.match(app, /\/brand\/akshaconnect-wordmark\.png/);
  assert.doesNotMatch(app, /className="brand-mark[^"]*"[^>]*>A</);
});

test('V4A4 web removes legacy purple brand surfaces', () => {
  const styles = read('apps/web/src/styles.css');
  const messages = read('apps/web/src/messages.css');

  assert.match(styles, /V4A4 - AkshaConnect web visual refresh/);
  assert.match(messages, /V4A4 - message and attachment brand overrides/);

  assert.match(
    styles,
    /workspace-sidebar[\s\S]*background:[\s\S]*#ffffff/
  );

  assert.match(
    styles,
    /nav-item\.active[\s\S]*var\(--ac-blue\)/
  );

  assert.match(
    messages,
    /unread-badge[\s\S]*var\(--ac-orange\)/
  );
});

test('V4A4 web carries approved brand copy', () => {
  const app = read('apps/web/src/App.jsx');

  assert.match(app, /PEOPLE\s+•\s+IDEAS\s+•\s+TOGETHER/);
  assert.match(app, /A BRIGHTER WORKPLACE TOGETHER/);
  assert.doesNotMatch(app, /Work together\. Stay connected\./);
});

test('V4A4 web favicon and theme color use AkshaConnect branding', () => {
  const html = read('apps/web/index.html');

  assert.match(html, /href="\/favicon\.png"/);
  assert.match(html, /name="theme-color" content="#0879E7"/);

  assert.ok(
    fs.existsSync(
      path.join(root, 'apps/web/public/favicon.png')
    )
  );
});
