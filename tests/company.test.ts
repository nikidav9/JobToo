import assert from 'node:assert/strict';
import test from 'node:test';

import { companyInitials, isLavkaCompany, normalizeCompany } from '../services/company.ts';

test('normalizeCompany preserves a partner company name', () => {
  assert.equal(normalizeCompany('  Купер  '), 'Купер');
});

test('normalizeCompany uses a neutral fallback when a company is missing', () => {
  assert.equal(normalizeCompany(null), 'Компания');
  assert.equal(normalizeCompany('   '), 'Компания');
});

test('isLavkaCompany recognises supported Lavka spellings', () => {
  assert.equal(isLavkaCompany('Яндекс Лавка'), true);
  assert.equal(isLavkaCompany('Купер'), false);
});

test('companyInitials builds a compact fallback mark', () => {
  assert.equal(companyInitials('Вкусно и точка'), 'ВИ');
  assert.equal(companyInitials('Купер'), 'К');
});
