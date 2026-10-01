import ReactNativeBlobUtil from 'react-native-blob-util';

const STORE_PATH =
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/akshaconnect-saved-messages-v1.json`;
const MAX_SAVED_MESSAGES = 500;

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function scopeKey({ identityId, workspaceId, workspaceMemberId } = {}) {
  const identity = clean(identityId);
  const workspace = clean(workspaceId);
  const member = clean(workspaceMemberId);
  return identity && workspace && member
    ? `${identity}:${workspace}:${member}`
    : '';
}


async function readStore() {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(STORE_PATH))) {
      return { version: 1, scopes: {} };
    }
    const raw = await ReactNativeBlobUtil.fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, scopes: {} };
    return {
      version: 1,
      scopes: parsed.scopes && typeof parsed.scopes === 'object' ? parsed.scopes : {},
    };
  } catch {
    return { version: 1, scopes: {} };
  }
}

async function writeStore(store) {
  try {
    await ReactNativeBlobUtil.fs.writeFile(
      STORE_PATH,
      JSON.stringify(store),
      'utf8'
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadSavedMessages(scope) {
  const key = scopeKey(scope);
  if (!key) return [];
  const store = await readStore();
  const rows = Array.isArray(store.scopes?.[key]) ? store.scopes[key] : [];
  return rows
    .filter((item) => item?.message_id && item?.conversation_id)
    .sort((a, b) => Date.parse(b.saved_at || '') - Date.parse(a.saved_at || ''));
}

export async function saveMessageLocally(scope, item = {}) {
  const key = scopeKey(scope);
  const messageId = clean(item.message_id);
  const conversationId = clean(item.conversation_id);
  if (!key || !messageId || !conversationId) return false;

  const store = await readStore();
  const current = Array.isArray(store.scopes[key]) ? store.scopes[key] : [];
  const nextItem = {
    message_id: messageId,
    conversation_id: conversationId,
    conversation_kind: clean(item.conversation_kind) || 'dm',
    conversation_title: clean(item.conversation_title) || 'Conversation',
    conversation_subtitle: clean(item.conversation_subtitle),
    other_workspace_member_id: clean(item.other_workspace_member_id),
    sender_display_name: clean(item.sender_display_name),
    message_type: clean(item.message_type) || 'TEXT',
    body_text: clean(item.body_text),
    created_at: item.created_at || null,
    saved_at: new Date().toISOString(),
  };

  store.scopes[key] = [
    nextItem,
    ...current.filter((row) => row?.message_id !== messageId),
  ].slice(0, MAX_SAVED_MESSAGES);

  return writeStore(store);
}

export async function removeSavedMessageLocally(scope, messageId) {
  const key = scopeKey(scope);
  const id = clean(messageId);
  if (!key || !id) return false;

  const store = await readStore();
  const current = Array.isArray(store.scopes[key]) ? store.scopes[key] : [];
  store.scopes[key] = current.filter((row) => row?.message_id !== id);
  return writeStore(store);
}
