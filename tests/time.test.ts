import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agoRu } from '../services/time.ts';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test('agoRu: склонение и границы', () => {
  assert.equal(agoRu(ago(10_000)), 'только что');
  assert.equal(agoRu(ago(1 * MIN)), '1 минуту назад');
  assert.equal(agoRu(ago(2 * MIN)), '2 минуты назад');
  assert.equal(agoRu(ago(5 * MIN)), '5 минут назад');
  assert.equal(agoRu(ago(11 * MIN)), '11 минут назад');
  assert.equal(agoRu(ago(21 * MIN)), '21 минуту назад');
  assert.equal(agoRu(ago(33 * MIN)), '33 минуты назад');
  assert.equal(agoRu(ago(1 * HOUR)), '1 час назад');
  assert.equal(agoRu(ago(3 * HOUR)), '3 часа назад');
  assert.equal(agoRu(ago(23 * HOUR)), '23 часа назад');
  assert.equal(agoRu(ago(1 * DAY)), '1 день назад');
  assert.equal(agoRu(ago(3 * DAY)), '3 дня назад');
  assert.equal(agoRu(ago(29 * DAY)), '29 дней назад');
  assert.equal(agoRu(ago(60 * DAY)), '2 месяца назад');
});

test('agoRu: нет даты или дата в будущем', () => {
  assert.equal(agoRu(undefined), '');
  assert.equal(agoRu(''), '');
  assert.equal(agoRu('не дата'), '');
  assert.equal(agoRu(new Date(Date.now() + 60_000).toISOString()), 'только что');
});

import { domainOf } from '../services/time.ts';

test('domainOf: домен источника без www', () => {
  assert.equal(domainOf('https://hh.ru/vacancy/123?query=1'), 'hh.ru');
  assert.equal(domainOf('https://www.superjob.ru/vakansii/x-456.html'), 'superjob.ru');
  assert.equal(domainOf('http://trudvsem.ru/vacancy/abc'), 'trudvsem.ru');
  assert.equal(domainOf('www.hh.ru/vacancy/1'), 'hh.ru');
  assert.equal(domainOf('https://HH.RU:443/x'), 'hh.ru');
  assert.equal(domainOf(undefined), '');
  assert.equal(domainOf(''), '');
  assert.equal(domainOf('не ссылка'), '');
});

import { plural } from '../services/time.ts';

test('plural: места', () => {
  assert.equal(plural(1, 'место', 'места', 'мест'), 'место');
  assert.equal(plural(3, 'место', 'места', 'мест'), 'места');
  assert.equal(plural(5, 'место', 'места', 'мест'), 'мест');
  assert.equal(plural(11, 'место', 'места', 'мест'), 'мест');
  assert.equal(plural(21, 'место', 'места', 'мест'), 'место');
});
