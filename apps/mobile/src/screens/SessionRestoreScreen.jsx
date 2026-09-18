import React from 'react';

import {
  ActivityIndicator,
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
        <View style={styles.mark}>
          <Text style={styles.markText}>
            A
          </Text>
        </View>

        <Text style={styles.brand}>
          AkshaConnect
        </Text>

        <ActivityIndicator
          size="small"
          color="#00BFA5"
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
    },

    mark: {
      width: 68,
      height: 68,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#00BFA5',
    },

    markText: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '900',
    },

    brand: {
      marginTop: 14,
      color: '#FFFFFF',
      fontSize: 25,
      fontWeight: '900',
    },

    spinner: {
      marginTop: 28,
    },

    title: {
      marginTop: 16,
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '800',
    },

    message: {
      maxWidth: 360,
      marginTop: 8,
      color: '#A8B3C7',
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
      backgroundColor: '#00BFA5',
    },

    primaryText: {
      color: '#FFFFFF',
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
      borderColor: '#41546A',
      alignItems: 'center',
      justifyContent: 'center',
    },

    secondaryText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
    },

    pressed: {
      opacity: 0.8,
    },
  });
