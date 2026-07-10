import React from 'react';
import { Image } from 'expo-image';

/** Круглый логотип Лавки (прозрачный фон) для карточек вакансий и смен. */
export function LavkaLogo({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/lavka-logo.png')}
      style={{ width: size, height: size, flexShrink: 0 }}
      contentFit="contain"
    />
  );
}
