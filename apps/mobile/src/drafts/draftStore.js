import ReactNativeBlobUtil from 'react-native-blob-util';

const STORE_VERSION = 1;
const MAX_DRAFTS = 100;
const MAX_DRAFT_CHARS = 8000;
const STORE_PATH =
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/akshaconnect-drafts-v1.json`;

let operationQueue = Promise.resolve();

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function draftKey(scope = {}) {
  const identityId = clean(scope.identityId || scope.identity_id);
  const workspaceId = clean(scope.workspaceId || scope.workspace_id);
  const conversationId = clean(
    scope.conversationId || scope.conversation_id
  );

  if (!identityId || !workspaceId || !conversationId) {
    return '';
  }

  return [identityId, workspaceId, conversationId].join('|');
}

async function readStore() {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(STORE_PATH);
    if (!exists) {
      return { version: STORE_VERSION, drafts: {} };
    }

    const raw = await ReactNativeBlobUtil.fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      parsed.version !== STORE_VERSION ||
      !parsed.drafts ||
      typeof parsed.drafts !== 'object'
    ) {
      return { version: STORE_VERSION, drafts: {} };
    }

    return parsed;
  } catch {
    return { version: STORE_VERSION, drafts: {} };
  }
}

async function writeStore(store) {
  await ReactNativeBlobUtil.fs.writeFile(
    STORE_PATH,
    JSON.stringify(store),
    'utf8'
  );
}

function pruneDrafts(drafts) {
  const entries = Object.entries(drafts || {})
    .filter(([, value]) => typeof value?.text === 'string')
    .sort((left, right) =>
      String(right[1]?.updatedAt || '').localeCompare(
        String(left[1]?.updatedAt || '')
      )
    )
    .slice(0, MAX_DRAFTS);

  return Object.fromEntries(entries);
}

function enqueue(operation) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => {});
  return next;
}

export function conversationDraftKey(scope) {
  return draftKey(scope);
}

export function loadConversationDraft(scope) {
  const key = draftKey(scope);
  if (!key) return Promise.resolve('');

  return enqueue(async () => {
    const store = await readStore();
    return String(store.drafts?.[key]?.text || '');
  });
}

export function saveConversationDraft(scope, value) {
  const key = draftKey(scope);
  if (!key) return Promise.resolve();

  const text = String(value ?? '').slice(0, MAX_DRAFT_CHARS);

  return enqueue(async () => {
    const store = await readStore();
    const drafts = { ...(store.drafts || {}) };

    if (!text) {
      delete drafts[key];
    } else {
      drafts[key] = {
        text,
        updatedAt: new Date().toISOString(),
      };
    }

    await writeStore({
      version: STORE_VERSION,
      drafts: pruneDrafts(drafts),
    });
  });
}

export function clearConversationDraft(scope) {
  return saveConversationDraft(scope, '');
}

export const DRAFT_STORE_PATH = STORE_PATH;
export const DRAFT_STORE_VERSION = STORE_VERSION;
