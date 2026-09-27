import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  keepLocalCopy,
  pick,
  types as documentTypes,
} from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  downloadAttachmentToCache,
  listThread,
  sendMessage,
  uploadAttachment,
} from '../api/client';
import { colors } from '../theme/colors';

const MAX_PENDING_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PICK_TYPES = [
  documentTypes.images,
  documentTypes.pdf,
  documentTypes.plainText,
  documentTypes.csv,
  documentTypes.docx,
  documentTypes.xlsx,
  documentTypes.pptx,
].flat();

function makeClientMessageId() {
  return `mobile-thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.message_id) map.set(row.message_id, row);
  }
  return [...map.values()].sort((a, b) => {
    const byTime = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
    return byTime || String(a.message_id).localeCompare(String(b.message_id));
  });
}

function localPathFromUri(value) {
  const raw = String(value || '').replace(/^file:\/\//, '');
  try { return decodeURI(raw); } catch { return raw; }
}

async function prepareLocalCopy(item) {
  const result = await keepLocalCopy({
    files: [{ uri: item.uri, fileName: item.name || `thread-${item.clientMessageId}` }],
    destination: 'cachesDirectory',
  });
  const copy = result?.[0];
  if (!copy || copy.status !== 'success' || !copy.localUri) {
    throw new Error(copy?.copyError || 'Could not prepare attachment');
  }
  return localPathFromUri(copy.localUri);
}

function ThreadMessage({ message, currentMemberId, onOpenAttachment }) {
  const deleted = Boolean(message.deleted_at);
  const own =
    message.sender_type === 'HUMAN' &&
    message.sender_member_id === currentMemberId;

  return (
    <View style={[styles.messageRow, own ? styles.messageRowOwn : null]}>
      {!own ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {String(message.sender_display_name || 'M').slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ) : null}

      <View style={[styles.messageBubble, own ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
        <View style={styles.metaRow}>
          <Text style={[styles.sender, own ? styles.senderOwn : null]}>
            {own ? 'You' : message.sender_display_name || 'Member'}
          </Text>
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
          {message.edited_at && !deleted ? <Text style={styles.edited}>edited</Text> : null}
        </View>

        {deleted ? (
          <Text style={styles.deleted}>Message deleted</Text>
        ) : message.message_type !== 'ATTACHMENT' ? (
          <Text style={styles.body}>{message.body_text || ''}</Text>
        ) : null}

        {!deleted && Array.isArray(message.attachments) ? message.attachments.map((attachment) => (
          <Pressable
            key={attachment.attachment_id}
            style={[styles.attachment, own ? styles.attachmentOwn : null]}
            onPress={() => onOpenAttachment(attachment)}
          >
            <Text style={styles.attachmentName} numberOfLines={1}>{attachment.file_name}</Text>
            <Text style={styles.attachmentMeta}>{formatSize(attachment.size_bytes)} · Open</Text>
          </Pressable>
        )) : null}
      </View>
    </View>
  );
}

export default function ThreadModal({
  visible,
  serverUrl,
  token,
  conversationId,
  parentMessage,
  realtimeEvents,
  currentMemberId,
  onClose,
  onRead,
}) {
  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  const lastSequenceRef = useRef(0);
  const scrollRef = useRef(null);
  const parentId = parentMessage?.message_id || '';

  useEffect(() => {
    if (!visible || !parentId || !conversationId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setParent(parentMessage);
    setReplies([]);
    setDraft('');
    setPending([]);
    listThread(serverUrl, token, conversationId, parentId)
      .then((result) => {
        if (cancelled) return;
        setParent(result.parent || parentMessage);
        setReplies(result.replies || []);
        const latest = (result.replies || []).at(-1);
        if (latest?.message_id) onRead?.(latest.message_id);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError?.message || 'Could not load thread'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, parentId, conversationId, token, serverUrl, parentMessage, onRead]);

  useEffect(() => {
    if (!visible || !Array.isArray(realtimeEvents)) return;
    const events = realtimeEvents.filter((event) => Number(event?.sequence || 0) > lastSequenceRef.current);
    for (const event of events) {
      lastSequenceRef.current = Math.max(lastSequenceRef.current, Number(event?.sequence || 0));
      const payload = event?.payload || event;
      const message = payload?.message;
      if (!message || payload?.conversation_id !== conversationId) continue;
      if (message.message_id === parentId) {
        setParent(message);
        continue;
      }
      if (message.reply_to_message_id !== parentId) continue;
      if (payload.type === 'message.created') {
        setReplies((current) => mergeById([...current, message]));
        onRead?.(message.message_id);
      } else if (payload.type === 'message.updated' || payload.type === 'message.deleted') {
        setReplies((current) => current.map((item) => item.message_id === message.message_id ? message : item));
      }
    }
  }, [visible, realtimeEvents, conversationId, parentId, onRead]);

  const title = useMemo(() => `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`, [replies.length]);

  async function chooseAttachments() {
    try {
      const rows = await pick({ allowMultiSelection: true, type: PICK_TYPES });
      setPending((current) => {
        const next = [...current];
        for (const item of rows || []) {
          if (next.length >= MAX_PENDING_ATTACHMENTS) break;
          const size = Number(item.size || 0);
          if (!size || size > MAX_ATTACHMENT_BYTES) {
            setError(`${item.name || 'File'} must be 10 MB or smaller`);
            continue;
          }
          next.push({
            uri: item.uri,
            name: item.name || 'attachment',
            size,
            contentType: item.type || 'application/octet-stream',
            clientMessageId: makeClientMessageId(),
          });
        }
        return next;
      });
    } catch (requestError) {
      if (String(requestError?.code || '').includes('CANCEL')) return;
      setError(requestError?.message || 'Could not choose attachment');
    }
  }

  async function openAttachment(attachment) {
    try {
      const downloaded = await downloadAttachmentToCache(serverUrl, token, conversationId, attachment);
      await ReactNativeBlobUtil.android.actionViewIntent(downloaded.localPath, downloaded.contentType);
    } catch (requestError) {
      setError(requestError?.message || 'Could not open attachment');
    }
  }

  async function submit() {
    const bodyText = draft.trim();
    if (sending || (!bodyText && pending.length === 0)) return;
    setSending(true);
    setError('');
    try {
      const created = [];
      if (bodyText) {
        const result = await sendMessage(serverUrl, token, conversationId, {
          bodyText,
          clientMessageId: makeClientMessageId(),
          replyToMessageId: parentId,
        });
        if (result?.message) created.push(result.message);
        setDraft('');
      }
      for (const item of pending) {
        let localPath = '';
        try {
          localPath = await prepareLocalCopy(item);
          const result = await uploadAttachment(serverUrl, token, conversationId, {
            localPath,
            fileName: item.name,
            contentType: item.contentType,
            clientMessageId: item.clientMessageId,
            replyToMessageId: parentId,
          });
          if (result?.message) created.push(result.message);
        } finally {
          if (localPath) await ReactNativeBlobUtil.fs.unlink(localPath).catch(() => {});
        }
      }
      if (created.length) {
        setReplies((current) => mergeById([...current, ...created]));
        onRead?.(created.at(-1)?.message_id);
      }
      setPending([]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (requestError) {
      setError(requestError?.message || 'Could not send thread reply');
    } finally {
      setSending(false);
    }
  }

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
        <StatusBar
          backgroundColor={colors.primary}
          barStyle="light-content"
        />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close thread"
              onPress={onClose}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>‹</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Thread</Text>
              <Text style={styles.headerSubtitle}>{title}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.history}
            contentContainerStyle={styles.historyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
          {parent ? <ThreadMessage message={parent} currentMemberId={currentMemberId} onOpenAttachment={openAttachment} /> : null}
          <View style={styles.separator}><View style={styles.line}/><Text style={styles.separatorText}>Replies</Text><View style={styles.line}/></View>
          {loading ? <ActivityIndicator color={colors.accent} /> : null}
          {!loading && replies.length === 0 ? <Text style={styles.empty}>No replies yet.</Text> : null}
          {replies.map((message) => (
            <ThreadMessage
              key={message.message_id}
              message={message}
              currentMemberId={currentMemberId}
              onOpenAttachment={openAttachment}
            />
          ))}
        </ScrollView>

        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        {pending.length ? <View style={styles.pending}>{pending.map((item) => <View key={item.clientMessageId} style={styles.pendingItem}><Text numberOfLines={1} style={styles.pendingName}>{item.name}</Text><Pressable onPress={() => setPending((rows) => rows.filter((row) => row.clientMessageId !== item.clientMessageId))}><Text style={styles.pendingRemove}>×</Text></Pressable></View>)}</View> : null}
          <View style={styles.composer}>
            <Pressable onPress={chooseAttachments} disabled={sending || pending.length >= MAX_PENDING_ATTACHMENTS} style={styles.attachButton}><Text style={styles.attachText}>＋</Text></Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply in thread"
              placeholderTextColor="#7b8595"
              multiline
              maxLength={8000}
              textAlignVertical="top"
              onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))}
            />
            <Pressable onPress={submit} disabled={sending || (!draft.trim() && pending.length === 0)} style={styles.sendButton}><Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:colors.primary},
  flex:{flex:1,backgroundColor:'#F6F9FC'},
  header:{minHeight:72,paddingHorizontal:12,flexDirection:'row',alignItems:'center',backgroundColor:colors.primary,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'rgba(255,255,255,.22)'},
  headerButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,.12)'},
  headerButtonText:{marginTop:-3,fontSize:34,lineHeight:38,color:'#fff'},
  headerCopy:{flex:1,marginHorizontal:12},
  headerTitle:{fontSize:18,fontWeight:'900',color:'#fff'},
  headerSubtitle:{marginTop:1,fontSize:12,fontWeight:'600',color:'rgba(255,255,255,.82)'},
  headerSpacer:{width:42},

  history:{flex:1,backgroundColor:'#F6F9FC'},
  historyContent:{paddingHorizontal:14,paddingTop:14,paddingBottom:28},

  messageRow:{width:'100%',flexDirection:'row',alignItems:'flex-end',gap:9,paddingVertical:5,justifyContent:'flex-start'},
  messageRowOwn:{justifyContent:'flex-end'},
  avatar:{width:32,height:32,borderRadius:10,backgroundColor:'#E8EEF5',alignItems:'center',justifyContent:'center',marginBottom:2},
  avatarText:{fontWeight:'800',color:'#31506F'},
  messageBubble:{maxWidth:'82%',paddingHorizontal:13,paddingTop:9,paddingBottom:9,borderRadius:17,borderWidth:1,shadowColor:'#0F2742',shadowOffset:{width:0,height:1},shadowOpacity:.03,shadowRadius:2,elevation:1},
  messageBubbleOther:{backgroundColor:'#FFFFFF',borderColor:'#DCE5ED',borderBottomLeftRadius:5},
  messageBubbleOwn:{backgroundColor:'#EAF4FF',borderColor:'#C9E1FA',borderBottomRightRadius:5},

  metaRow:{flexDirection:'row',alignItems:'center',gap:7},
  sender:{fontSize:11,fontWeight:'900',color:'#243B53'},
  senderOwn:{color:'#1769AA'},
  time:{fontSize:10,color:'#7B8998'},
  edited:{fontSize:9,color:'#8896A5'},
  body:{marginTop:4,color:'#18324A',fontSize:14,lineHeight:20},
  deleted:{marginTop:4,color:'#7B8998',fontStyle:'italic'},

  separator:{flexDirection:'row',alignItems:'center',gap:9,marginVertical:13},
  line:{height:StyleSheet.hairlineWidth,backgroundColor:'#D7E1EA',flex:1},
  separatorText:{fontSize:10,fontWeight:'800',color:'#8493A2',textTransform:'uppercase',letterSpacing:.45},
  empty:{textAlign:'center',color:'#7B8998',padding:18},

  attachment:{marginTop:7,borderWidth:1,borderColor:'#DCE5ED',borderRadius:10,padding:9,backgroundColor:'#F8FAFC'},
  attachmentOwn:{backgroundColor:'#F3F8FE',borderColor:'#C9E1FA'},
  attachmentName:{fontWeight:'700',color:'#20384F'},
  attachmentMeta:{fontSize:10,color:'#687B8E',marginTop:2},

  error:{paddingHorizontal:12,paddingVertical:7,backgroundColor:'#FFF0F0'},
  errorText:{color:'#A22727'},
  pending:{paddingHorizontal:12,paddingTop:7,gap:5,backgroundColor:'#FFFFFF'},
  pendingItem:{flexDirection:'row',alignItems:'center',backgroundColor:'#EEF3F8',borderRadius:9,paddingHorizontal:9,paddingVertical:6},
  pendingName:{flex:1,fontSize:12,color:'#283F56'},
  pendingRemove:{fontSize:20,paddingHorizontal:7,color:'#5F7081'},

  composer:{borderTopWidth:1,borderTopColor:'#DCE5ED',paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'flex-end',gap:8,backgroundColor:'#FFFFFF'},
  attachButton:{width:46,height:46,borderRadius:15,backgroundColor:'#EFF6FD',borderWidth:1,borderColor:'#D6E8FA',alignItems:'center',justifyContent:'center'},
  attachText:{fontSize:28,lineHeight:30,color:colors.primary},
  input:{flex:1,minHeight:46,maxHeight:120,borderWidth:1,borderColor:'#CAD6E2',borderRadius:18,paddingHorizontal:14,paddingTop:11,paddingBottom:11,color:'#18324A',backgroundColor:'#FFFFFF',fontSize:14},
  sendButton:{minWidth:66,height:46,borderRadius:15,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  sendText:{color:'#FFFFFF',fontWeight:'900'}
});
