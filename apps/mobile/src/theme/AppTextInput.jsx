import React, { forwardRef } from 'react';
import {
  StyleSheet,
  TextInput as NativeTextInput,
} from 'react-native';

import {
  scaleTextMetric,
  useAppAppearance,
} from './appearanceStore';

const AppTextInput = forwardRef(function AppTextInput(
  {
    style,
    ...props
  },
  ref
) {
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
    <NativeTextInput
      {...props}
      ref={ref}
      style={[style, scaled]}
    />
  );
});

export default AppTextInput;
