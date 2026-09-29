import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../theme/colors';

export default function MessageActionSheet({
  visible,
  title = 'Message actions',
  reactions = [],
  actions = [],
  onClose,
}) {
  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close message actions"
        style={styles.overlay}
        onPress={onClose}
      >
        <Pressable
          accessibilityRole="menu"
          accessibilityLabel={title}
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {reactions.length ? (
            <View
              accessibilityRole="toolbar"
              accessibilityLabel="Quick reactions"
              style={styles.reactionBar}
            >
              {reactions.map((reaction) => (
                <Pressable
                  key={reaction.key || reaction.emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${reaction.emoji}`}
                  disabled={Boolean(reaction.disabled)}
                  onPress={reaction.onPress}
                  style={({ pressed }) => [
                    styles.reactionButton,
                    reaction.selected
                      ? styles.reactionButtonSelected
                      : null,
                    reaction.disabled
                      ? styles.actionDisabled
                      : null,
                    pressed && !reaction.disabled
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text style={styles.reactionEmoji}>
                    {reaction.emoji}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                key={action.key || action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                disabled={Boolean(action.disabled)}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.action,
                  action.destructive
                    ? styles.actionDestructive
                    : null,
                  action.disabled
                    ? styles.actionDisabled
                    : null,
                  pressed && !action.disabled
                    ? styles.actionPressed
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.actionIcon,
                    action.destructive
                      ? styles.actionTextDestructive
                      : null,
                  ]}
                >
                  {action.icon || '·'}
                </Text>

                <Text
                  style={[
                    styles.actionText,
                    action.destructive
                      ? styles.actionTextDestructive
                      : null,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed ? styles.actionPressed : null,
            ]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(5, 18, 44, 0.54)',
  },
  sheet: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.surface,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    marginLeft: 10,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF5FC',
  },
  closeText: {
    marginTop: -2,
    color: colors.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  reactionBar: {
    minHeight: 54,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  reactionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionButtonSelected: {
    backgroundColor: '#E6F2FF',
    borderWidth: 1,
    borderColor: '#7FB7EE',
  },
  reactionEmoji: {
    fontSize: 23,
  },
  actionList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  action: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  actionDestructive: {
    backgroundColor: '#FFF9F9',
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionIcon: {
    width: 30,
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionText: {
    flex: 1,
    marginLeft: 4,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  actionTextDestructive: {
    color: colors.danger,
  },
  cancelButton: {
    minHeight: 42,
    marginTop: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF5FC',
  },
  cancelText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
});
