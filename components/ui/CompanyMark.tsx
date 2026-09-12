import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LavkaLogo } from '@/components/ui/LavkaLogo';
import { companyInitials, isLavkaCompany, normalizeCompany } from '@/services/company';
import { nameColorFromString } from '@/services/storage';
import { rf } from '@/constants/scale';

/**
 * Знак компании: логотип, если мы его знаем, иначе кружок с инициалами.
 *
 * Жил внутри ленты, а нужен ещё и на экранах вакансии. Копировать не стали:
 * две копии знака компании разойдутся цветом или размером, и одна и та же
 * компания будет выглядеть в ленте и в подробностях по-разному.
 */
export function CompanyMark({ company, size = 44 }: { company?: string | null; size?: number }) {
  const name = normalizeCompany(company);
  if (isLavkaCompany(name)) return <LavkaLogo size={size} />;
  return (
    <View
      accessibilityLabel={`Логотип компании ${name}`}
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: nameColorFromString(name) },
      ]}
    >
      <Text style={[styles.text, { fontSize: rf(size * 0.34) }]}>{companyInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { color: '#fff', fontWeight: '800' },
});
