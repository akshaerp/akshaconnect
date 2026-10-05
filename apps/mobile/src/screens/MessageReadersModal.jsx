import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Text from '../theme/AppText';
import { colors } from '../theme/colors';
import { ConversationHeader } from './ConversationChrome.jsx';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

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

function formatReceiptTime(value, fallback) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReadTime(value) {
  return formatReceiptTime(
    value,
    'Read'
  );
}

async function fetchReceiptPage({
  serverUrl,
  token,
  conversationId,
  messageId,
  status,
  offset = 0,
}) {
  const root =
    String(serverUrl || '')
      .replace(/\/+$/, '');

  const path =
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
    `/messages/${encodeURIComponent(messageId)}/receipts` +
    `?status=${encodeURIComponent(status)}` +
    `&limit=${PAGE_SIZE}` +
    `&offset=${encodeURIComponent(String(offset))}`;

  let response;
  try {
    response = await fetch(
      `${root}${path}`,
      {
        headers: {
          accept:
            'application/json',
          authorization:
            `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    throw new Error(
      error?.message ||
      'Could not reach the AkshaConnect server'
    );
  }

  const text =
    await response.text();

  let payload = {};
  if (text) {
    try {
      payload =
        JSON.parse(text);
    } catch {
      throw new Error(
        'The server returned an invalid response'
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
      'Could not load message info'
    );
  }

  return payload;
}

async function fetchAllReceipts(input) {
  const rows = [];
  let offset = 0;
  let total = 0;

  for (
    let pageIndex = 0;
    pageIndex < MAX_PAGES;
    pageIndex += 1
  ) {
    const payload =
      await fetchReceiptPage({
        ...input,
        offset,
      });

    const pageRows =
      Array.isArray(
        payload?.receipts
      )
        ? payload.receipts
        : [];

    rows.push(...pageRows);

    total =
      Number(
        payload?.total ||
        rows.length
      );

    if (
      !payload?.page?.has_more ||
      pageRows.length === 0
    ) {
      break;
    }

    offset =
      Number(
        payload?.page
          ?.next_offset ||
        rows.length
      );
  }

  return {
    rows,
    total,
  };
}

function ReceiptSection({
  title,
  count,
  rows,
  emptyText,
  timeField,
  timeFallback,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {title}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {count}
          </Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.emptyText}>
          {emptyText}
        </Text>
      ) : (
        rows.map(
          (reader, index) => (
            <View
              key={
                `${title}-${reader.display_name || 'member'}-${reader[timeField] || ''}-${index}`
              }
              style={styles.readerRow}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials(
                    reader.display_name
                  )}
                </Text>
              </View>

              <View style={styles.readerCopy}>
                <Text
                  style={styles.readerName}
                  numberOfLines={1}
                >
                  {reader.display_name ||
                    'Member'}
                </Text>
                <Text style={styles.readerTime}>
                  {timeField === 'read_at'
                    ? formatReadTime(reader.read_at)
                    : formatReceiptTime(
                        reader[timeField],
                        timeFallback
                      )}
                </Text>
              </View>
            </View>
          )
        )
      )}
    </View>
  );
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
  const [readers, setReaders] =
    useState([]);
  const [delivered, setDelivered] =
    useState([]);
  const [readTotal, setReadTotal] =
    useState(0);
  const [
    deliveredTotal,
    setDeliveredTotal,
  ] = useState(0);
  const [initialLoading, setInitialLoading] =
    useState(false);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] =
    useState('');

  const messageId =
    message?.message_id || '';

  const preview = useMemo(() => {
    const body =
      String(
        message?.body_text || ''
      ).trim();

    if (body) return body;
    if (
      message?.message_type ===
      'ATTACHMENT'
    ) {
      return 'Attachment';
    }

    return 'Message';
  }, [message]);

  const load = useCallback(
    async ({
      initial = false,
      manual = false,
      silent = false,
    } = {}) => {
      if (
        !visible ||
        !serverUrl ||
        !token ||
        !conversationId ||
        !messageId
      ) {
        return;
      }

      if (initial) {
        setInitialLoading(true);
      } else if (manual) {
        setRefreshing(true);
      }

      if (!silent) {
        setError('');
      }

      try {
        const [
          readResult,
          deliveredResult,
        ] = await Promise.all([
          fetchAllReceipts({
            serverUrl,
            token,
            conversationId,
            messageId,
            status: 'READ',
          }),
          fetchAllReceipts({
            serverUrl,
            token,
            conversationId,
            messageId,
            status: 'DELIVERED',
          }),
        ]);

        setReaders(
          readResult.rows
        );
        setReadTotal(
          readResult.total
        );
        setDelivered(
          deliveredResult.rows
        );
        setDeliveredTotal(
          deliveredResult.total
        );

        setError('');
      } catch (requestError) {
        if (!silent) {
          setError(
            requestError?.message ||
            'Could not load message info'
          );
        }
      } finally {
        if (initial) {
          setInitialLoading(false);
        }

        if (manual) {
          setRefreshing(false);
        }
      }
    },
    [
      visible,
      serverUrl,
      token,
      conversationId,
      messageId,
    ]
  );

  useEffect(() => {
    if (!visible) return;

    setReaders([]);
    setDelivered([]);
    setReadTotal(0);
    setDeliveredTotal(0);

    load({ initial: true });
  }, [
    visible,
    messageId,
    load,
  ]);

  useEffect(() => {
    if (
      !visible ||
      refreshEpoch <= 0
    ) {
      return;
    }

    load({ silent: true });
  }, [
    refreshEpoch,
    visible,
    load,
  ]);

  return (
    <Modal
      visible={Boolean(visible)}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <ConversationHeader
          title="Message info"
          subtitle={
            `${readTotal} read · ${deliveredTotal} delivered`
          }
          onBack={onClose}
          backAccessibilityLabel="Close message info"
        />

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>
            MESSAGE
          </Text>
          <Text
            style={styles.previewText}
            numberOfLines={3}
          >
            {preview}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {error}
            </Text>
            <Pressable
              onPress={() =>
                load({ initial: true })
              }
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        {initialLoading &&
        readers.length === 0 &&
        delivered.length === 0 &&
        !error ? (
          <View style={styles.centerState}>
            <ActivityIndicator
              color={colors.primary}
            />
            <Text style={styles.stateText}>
              Loading message info…
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={
              styles.listContent
            }
            showsVerticalScrollIndicator={
              false
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() =>
                  load({ manual: true })
                }
                tintColor={colors.primary}
              />
            }
          >
            <ReceiptSection
              title="Read by"
              count={readTotal}
              rows={readers}
              emptyText="No one has read this message yet."
              timeField="read_at"
              timeFallback="Read"
            />

            <ReceiptSection
              title="Delivered to"
              count={deliveredTotal}
              rows={delivered}
              emptyText="No unread recipient delivery confirmations yet."
              timeField="delivered_at"
              timeFallback="Delivered"
            />

            <Text style={styles.note}>
              Recipients move from Delivered to Read after their read receipt is recorded. Pull down to refresh delivery status.
            </Text>
          </ScrollView>
        )}
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
    flex: 1,
    paddingVertical: 34,
    alignItems: 'center',
  },
  stateText: {
    marginTop: 7,
    maxWidth: 300,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  section: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    color: colors.navy,
    fontSize: 14,
    fontWeight: '900',
  },
  countBadge: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  countText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  emptyText: {
    paddingVertical: 18,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  readerRow: {
    minHeight: 64,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth:
      StyleSheet.hairlineWidth,
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
  note: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
});
