export function findActiveMention(value) {
  const text = String(value || '');
  const match = /(^|\s)([@#])([^\s@#]*)$/u.exec(text);
  if (!match) return null;
  return {
    type: match[2] === '@' ? 'MEMBER' : 'CHANNEL',
    prefix: match[2],
    query: match[3] || '',
    start: match.index + match[1].length,
    end: text.length,
  };
}

export function normalizeMention(candidate) {
  const type = String(candidate?.mention_type || candidate?.type || '').toUpperCase();
  const targetId = String(
    candidate?.target_id ||
    candidate?.target_workspace_member_id ||
    candidate?.target_channel_conversation_id ||
    ''
  ).trim();

  if (!targetId || !['MEMBER', 'CHANNEL'].includes(type)) return null;

  const prefix = type === 'MEMBER' ? '@' : '#';
  const rawDisplayText = String(candidate?.display_text || '').trim();

  const label = String(
    candidate?.display_name ||
    candidate?.channel_name ||
    candidate?.label ||
    (
      rawDisplayText.startsWith(prefix)
        ? rawDisplayText.slice(1)
        : rawDisplayText
    ) ||
    ''
  ).trim();

  if (!label) return null;

  return {
    mention_type: type,
    target_id: targetId,
    display_text:
      rawDisplayText.startsWith(prefix)
        ? rawDisplayText
        : `${prefix}${label}`,
  };
}

export function applyMentionCandidate(value, active, candidate) {
  const mention = normalizeMention(candidate);
  if (!active || !mention) return { text: String(value || ''), mention: null };
  const source = String(value || '');
  return {
    text:
      source.slice(0, active.start) +
      mention.display_text +
      ' ' +
      source.slice(active.end),
    mention,
  };
}

export function mentionsStillPresent(value, mentions = []) {
  const text = String(value || '');
  const seen = new Set();
  return (mentions || [])
    .map(normalizeMention)
    .filter(Boolean)
    .filter((mention) => {
      const key = `${mention.mention_type}:${mention.target_id}`;
      if (seen.has(key) || !text.includes(mention.display_text)) return false;
      seen.add(key);
      return true;
    });
}

export function splitMentionText(value, mentions = []) {
  const text = String(value || '');
  const list = (mentions || [])
    .map((item) => ({
      mention_type: item.mention_type,
      target_id:
        item.target_id ||
        item.target_workspace_member_id ||
        item.target_channel_conversation_id,
      display_text: item.display_text,
    }))
    .filter((item) => item.target_id && item.display_text && text.includes(item.display_text))
    .sort((a,b) => b.display_text.length - a.display_text.length);

  if (!list.length) return [{ text, mention: null }];

  const result = [];
  let cursor = 0;
  while (cursor < text.length) {
    let next = null;
    for (const mention of list) {
      const index = text.indexOf(mention.display_text, cursor);
      if (index >= 0 && (!next || index < next.index)) next = { index, mention };
    }
    if (!next) {
      result.push({ text: text.slice(cursor), mention: null });
      break;
    }
    if (next.index > cursor) result.push({ text: text.slice(cursor, next.index), mention: null });
    result.push({ text: next.mention.display_text, mention: next.mention });
    cursor = next.index + next.mention.display_text.length;
  }
  return result;
}
