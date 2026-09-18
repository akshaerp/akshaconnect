import React from 'react';

import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  colors,
} from '../theme/colors';

const brandMark =
  require('../assets/brand/akshaconnect-mark.png');

const brandWordmark =
  require('../assets/brand/akshaconnect-wordmark.png');


export default function SessionRestoreScreen({
  message,
  onRetry,
  onUseAnotherAccount,
}) {
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <View style={styles.page}>
        <View style={styles.brandArea}>
          <Image
            source={brandMark}
            style={styles.brandMark}
            resizeMode="contain"
          />

          <Image
            source={brandWordmark}
            style={styles.brandWordmark}
            resizeMode="contain"
          />

          <Text style={styles.tagline}>
            PEOPLE • IDEAS • TOGETHER
          </Text>
        </View>

        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.spinner}
        />

        <Text style={styles.title}>
          Reconnecting
        </Text>

        <Text style={styles.message}>
          {message ||
            'Could not reconnect to AkshaConnect.'}
        </Text>

        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.primary,
            pressed
              ? styles.pressed
              : null,
          ]}
        >
          <Text style={styles.primaryText}>
            Retry
          </Text>
        </Pressable>

        <Pressable
          onPress={onUseAnotherAccount}
          style={({ pressed }) => [
            styles.secondary,
            pressed
              ? styles.pressed
              : null,
          ]}
        >
          <Text
            style={styles.secondaryText}
          >
            Sign in with another account
          </Text>
        </Pressable>

        <Text style={styles.promise}>
          A BRIGHTER WORKPLACE TOGETHER
        </Text>
      </View>
    </SafeAreaView>
  );
}


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        colors.shell,
    },

    page: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      backgroundColor:
        colors.shell,
    },

    brandArea: {
      alignItems: 'center',
    },

    brandMark: {
      width: 122,
      height: 122,
    },

    brandWordmark: {
      width: 250,
      height: 66,
      marginTop: 6,
    },

    tagline: {
      marginTop: 4,
      color: colors.textPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2.1,
    },

    spinner: {
      marginTop: 32,
    },

    title: {
      marginTop: 16,
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },

    message: {
      maxWidth: 360,
      marginTop: 8,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },

    primary: {
      width: '100%',
      maxWidth: 360,
      minHeight: 48,
      marginTop: 24,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        colors.primary,
    },

    primaryText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '900',
    },

    secondary: {
      width: '100%',
      maxWidth: 360,
      minHeight: 46,
      marginTop: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        colors.surface,
    },

    secondaryText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },

    promise: {
      marginTop: 28,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.3,
    },

    pressed: {
      opacity: 0.8,
    },
  });
