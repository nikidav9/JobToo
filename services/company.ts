const DEFAULT_COMPANY = 'Компания';

/** Preserve a partner's brand instead of labelling every vacancy as Lavka. */
export function normalizeCompany(raw?: string | null): string {
  const company = raw?.trim();
  return company || DEFAULT_COMPANY;
}

export function isLavkaCompany(raw?: string | null): boolean {
  const company = normalizeCompany(raw).toLocaleLowerCase('ru-RU');
  return company === 'лавка' || company === 'яндекс лавка' || company === 'яндекс.лавка';
}

export function companyInitials(raw?: string | null): string {
  return normalizeCompany(raw)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toLocaleUpperCase('ru-RU')
    .slice(0, 2);
}
