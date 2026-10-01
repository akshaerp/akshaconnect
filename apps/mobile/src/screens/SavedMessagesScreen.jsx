import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import Text from '../theme/AppText';
import { useAppAppearance } from '../theme/appearanceStore';
import {
  loadSavedMessages,
  removeSavedMessageLocally,
} from '../saved/savedMessageStore';

function formatTime(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SavedMessagesScreen({
  session,
  onOpenConversation,
}) {
  const { palette } = useAppAppearance();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const scope = {
    identityId: session?.identity?.identity_id || session?.identity_id || '',
    workspaceId: session?.workspace?.workspace_id || '',
    workspaceMemberId: session?.membership?.workspace_member_id || '',
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadSavedMessages(scope));
    } finally {
      setLoading(false);
    }
  }, [scope.identityId, scope.workspaceId, scope.workspaceMemberId]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(row) {
    await removeSavedMessageLocally(scope, row.message_id);
    setRows((current) => current.filter((item) => item.message_id !== row.message_id));
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { backgroundColor: palette.shell }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: palette.textPrimary }]}>Saved messages</Text>
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>Private to this AkshaConnect account on this device.</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : rows.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Nothing saved yet</Text>
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Long press a message and choose Save message.</Text>
        </View>
      ) : (
        rows.map((row) => (
          <View
            key={row.message_id}
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenConversation?.({
                kind: row.conversation_kind === 'channel' ? 'channel' : 'dm',
                conversationId: row.conversation_id,
                title: row.conversation_title || 'Conversation',
                subtitle: row.conversation_subtitle || '',
                otherWorkspaceMemberId: row.other_workspace_member_id || '',
                initialMessageId: row.message_id,
              })}
              style={styles.cardMain}
            >
              <Text style={[styles.conversation, { color: palette.textPrimary }]} numberOfLines={1}>
                {row.conversation_kind === 'channel' ? '# ' : ''}{row.conversation_title || 'Conversation'}
              </Text>
              <Text style={[styles.message, { color: palette.textSecondary }]} numberOfLines={3}>
                {row.body_text || (row.message_type === 'ATTACHMENT' ? 'Attachment' : 'Saved message')}
              </Text>
              <Text style={[styles.meta, { color: palette.textMuted }]}>
                {row.sender_display_name || 'Member'}{row.created_at ? ` · ${formatTime(row.created_at)}` : ''}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove saved message"
              onPress={() => remove(row)}
              style={styles.remove}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { marginTop: 4, marginBottom: 14, fontSize: 11.5, lineHeight: 17 },
  center: { padding: 30, alignItems: 'center' },
  empty: { padding: 18, borderRadius: 16, borderWidth: 1 },
  emptyTitle: { fontSize: 14, fontWeight: '900' },
  emptyText: { marginTop: 5, fontSize: 11.5, lineHeight: 17 },
  card: { marginBottom: 10, borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  cardMain: { padding: 13 },
  conversation: { fontSize: 12.5, fontWeight: '900' },
  message: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  meta: { marginTop: 7, fontSize: 9.5 },
  remove: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCE4EE', paddingVertical: 9, alignItems: 'center' },
  removeText: { color: '#B23A3A', fontSize: 11, fontWeight: '800' },
});
