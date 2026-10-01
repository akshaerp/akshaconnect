import React from 'react';
import {
  StyleSheet,
  Text as NativeText,
} from 'react-native';

import {
  scaleTextMetric,
  useAppAppearance,
} from './appearanceStore';

export default function AppText({
  style,
  ...props
}) {
  const { textScale } = useAppAppearance();
  const flattened = StyleSheet.flatten(style) || {};
  const scaled = {};

  if (Number.isFinite(Number(flattened.fontSize))) {
    scaled.fontSize = scaleTextMetric(
      flattened.fontSize,
      textScale
    );
  }

  if (Number.isFinite(Number(flattened.lineHeight))) {
    scaled.lineHeight = scaleTextMetric(
      flattened.lineHeight,
      textScale
    );
  }

  return (
    <NativeText
      {...props}
      style={[style, scaled]}
    />
  );
}
