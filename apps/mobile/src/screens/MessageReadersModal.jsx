import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Text from '../theme/AppText';
import { colors } from '../theme/colors';
import { ConversationHeader } from './ConversationChrome.jsx';

const PAGE_SIZE = 50;

function initials(value = '') {
  return (
    String(value)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'AC'
  );
}

function formatReadTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Read';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchReaders({
  serverUrl,
  token,
  conversationId,
  messageId,
  offset = 0,
}) {
  const root = String(serverUrl || '').replace(/\/+$/, '');
  const path =
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
    `/messages/${encodeURIComponent(messageId)}/readers` +
    `?limit=${PAGE_SIZE}&offset=${encodeURIComponent(String(offset))}`;

  let response;
  try {
    response = await fetch(`${root}${path}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new Error(error?.message || 'Could not reach the AkshaConnect server');
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('The server returned an invalid response');
    }
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Reader details are unavailable for this message. Please try again later.');
    }
    throw new Error(payload?.error?.message || 'Could not load reader details');
  }

  return payload;
}

export default function MessageReadersModal({
  visible,
  serverUrl,
  token,
  conversationId,
  message,
  refreshEpoch = 0,
  onClose,
}) {
  const [readers, setReaders] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const messageId = message?.message_id || '';
  const preview = useMemo(() => {
    const body = String(message?.body_text || '').trim();
    if (body) return body;
    if (message?.message_type === 'ATTACHMENT') return 'Attachment';
    return 'Message';
  }, [message]);

  const load = useCallback(async ({ append = false } = {}) => {
    if (!visible || !serverUrl || !token || !conversationId || !messageId) return;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const offset = append ? Number(nextOffset || 0) : 0;
      const payload = await fetchReaders({
        serverUrl,
        token,
        conversationId,
        messageId,
        offset,
      });
      const rows = Array.isArray(payload?.readers) ? payload.readers : [];
      setReaders((current) => (append ? [...current, ...rows] : rows));
      setTotal(Number(payload?.total || rows.length));
      setNextOffset(
        payload?.page?.has_more
          ? Number(payload?.page?.next_offset || offset + rows.length)
          : null
      );
    } catch (requestError) {
      setError(requestError?.message || 'Could not load readers');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [
    visible,
    serverUrl,
    token,
    conversationId,
    messageId,
    nextOffset,
  ]);

  useEffect(() => {
    if (!visible) return;
    setReaders([]);
    setTotal(0);
    setNextOffset(null);
    load({ append: false });
  }, [visible, messageId]);

  useEffect(() => {
    if (!visible || refreshEpoch <= 0) return;
    load({ append: false });
  }, [refreshEpoch]);

  const firstLoadPending =
    loading &&
    readers.length === 0 &&
    !error;
  const headerTitle =
    firstLoadPending || error
      ? 'Message readers'
      : `Read by ${total}`;
  const headerSubtitle =
    firstLoadPending
      ? 'Loading…'
      : error
        ? 'Reader details unavailable'
        : 'Read receipts';

  return (
    <Modal
      visible={Boolean(visible)}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ConversationHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          onBack={onClose}
          backAccessibilityLabel="Close message readers"
        />

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>MESSAGE</Text>
          <Text style={styles.previewText} numberOfLines={3}>{preview}</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load({ append: false })} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>Loading readers…</Text>
            </View>
          ) : readers.length === 0 && !error ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyTitle}>No readers yet</Text>
              <Text style={styles.stateText}>Read details will appear after another member reads this message.</Text>
            </View>
          ) : (
            readers.map((reader, index) => (
              <View
                key={`${reader.display_name || 'reader'}-${reader.read_at || ''}-${index}`}
                style={styles.readerRow}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(reader.display_name)}</Text>
                </View>
                <View style={styles.readerCopy}>
                  <Text style={styles.readerName} numberOfLines={1}>
                    {reader.display_name || 'Member'}
                  </Text>
                  <Text style={styles.readerTime}>{formatReadTime(reader.read_at)}</Text>
                </View>
              </View>
            ))
          )}

          {nextOffset !== null ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => load({ append: true })}
              disabled={loadingMore}
              style={styles.loadMoreButton}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  previewCard: {
    margin: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  previewText: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  errorCard: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 11,
    backgroundColor: '#FFF3F3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 11,
  },
  retryButton: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  retryText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 30,
  },
  centerState: {
    paddingVertical: 34,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '900',
  },
  stateText: {
    marginTop: 7,
    maxWidth: 300,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  readerRow: {
    minHeight: 64,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3EAF1',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  avatarText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  readerCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },
  readerName: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  readerTime: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10,
  },
  loadMoreButton: {
    minHeight: 42,
    marginTop: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
});
