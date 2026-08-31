
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const mapPath = path.join(root, 'docs', 'architecture', 'P0-V2-EXTRACTION-MAP.json');
const extraction = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const byPath = new Map(extraction.entries.map((item) => [item.source_path, item]));
const allowed = new Set(['MOVE', 'ADAPT', 'KEEP_IN_ERP', 'SHARED_CONTRACT', 'TRANSITIONAL', 'DEPRECATE_LATER']);

test('P0-V2 pins the audited AkshaERP source commit', () => {
  assert.equal(extraction.source_repository, 'akshaerp/aksha');
  assert.equal(extraction.source_commit, '21f72ba86bb1cb2e09012285a7b01d71a45280e0');
  assert.equal(extraction.standalone_base_commit, '7fe19047fbc61f2ba7daefbfd9c963c49e630293');
});

test('P0-V2 extraction map has unique paths and valid dispositions', () => {
  assert.ok(extraction.entries.length >= 80, 'expected a substantial file-level inventory');
  assert.equal(byPath.size, extraction.entries.length, 'source_path values must be unique');
  for (const item of extraction.entries) {
    assert.ok(item.source_path && item.area && item.target && item.reason);
    assert.ok(allowed.has(item.disposition), `invalid disposition for ${item.source_path}`);
  }
});

test('ERP-owned identity and CHUB implementation cannot be blindly moved', () => {
  for (const item of extraction.entries) {
    if (item.source_path.includes('/AccessManagement/') || item.source_path.includes('/CommunicationHub/')) {
      assert.notEqual(item.disposition, 'MOVE', `${item.source_path} must not be MOVE`);
    }
  }
});

test('critical extraction boundaries are explicitly classified', () => {
  const expect = (sourcePath, disposition) => {
    assert.equal(byPath.get(sourcePath)?.disposition, disposition, `${sourcePath} disposition`);
  };

  expect('server/src/modules/AkshaConnect/Collaboration/repositories/acnErpRecordLookupRepository.js', 'KEEP_IN_ERP');
  expect('server/src/modules/AkshaConnect/UserDirectory/repositories/acnUserDirectoryRepository.js', 'KEEP_IN_ERP');
  expect('client/src/modules/AkshaConnect/Collaboration/components/AcnErpEventCard.js', 'ADAPT');
  expect('server/src/modules/CommunicationHub/Outbox/services/chubAcnSystemSenderBridge.js', 'TRANSITIONAL');
  expect('server/src/modules/AkshaConnect/Collaboration/realtime/acnCrossProcessRealtimeRelay.js', 'TRANSITIONAL');
  expect('server/src/server.js', 'KEEP_IN_ERP');
});

test('collaboration domain models are owned by AkshaConnect', () => {
  const modelEntries = extraction.entries.filter((item) =>
    item.source_path.startsWith('server/src/modules/AkshaConnect/Collaboration/models/')
  );
  assert.ok(modelEntries.length >= 10);
  assert.ok(modelEntries.every((item) => item.disposition === 'MOVE'));
});
