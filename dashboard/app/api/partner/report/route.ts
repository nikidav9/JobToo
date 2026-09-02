import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { makeXlsx } from '@/lib/minimalXlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Access = { sourceId: string; name: string };

function accessFor(req: Request): Access | null {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!given) return null;
  let configured: Record<string, Access> = {};
  try { configured = JSON.parse(process.env.PARTNER_PORTAL_TOKENS_JSON ?? '{}'); } catch { return null; }
  const givenHash = createHash('sha256').update(given).digest();
  for (const [token, access] of Object.entries(configured)) {
    const expected = createHash('sha256').update(token).digest();
    if (timingSafeEqual(givenHash, expected) && access?.sourceId) return access;
  }
  return null;
}

function monthBounds(raw: string | null): { from: string; to: string; month: string } {
  const fallback = new Date();
  fallback.setUTCMonth(fallback.getUTCMonth() - 1, 1);
  const month = /^\d{4}-\d{2}$/.test(raw ?? '') ? raw! : fallback.toISOString().slice(0, 7);
  const [year, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  return { from: month + '-01', to: end, month };
}

async function backend(fn: string, args: unknown[]) {
  const secret = process.env.EXPO_PUBLIC_APP_SECRET;
  const admin = process.env.ADMIN_API_TOKEN;
  if (!secret || !admin) throw new Error('Сервер партнёрских отчётов не настроен');
  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': secret, 'X-Admin-Token': admin },
    body: JSON.stringify({ fn, args }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error || json.data?.error) throw new Error(json.error ?? json.data?.error ?? 'Ошибка отчёта');
  return json.data;
}

const HEADERS = ['event_id','source_id','candidate_id','application_id','event','occurred_at','amount_rub','jobtoo_status','partner_status','rejection_reason'];

function rows(events: any[]): Array<Array<string | number>> {
  return events.map(e => [
    e.id ?? '', e.source_id ?? '', e.worker_id ?? '', e.application_id ?? '',
    e.event_kind ?? '', e.occurred_at ?? '', Number(e.amount_rub ?? 0),
    e.status ?? '', e.partner_status ?? '', e.rejection_reason ?? '',
  ]);
}

function csv(data: Array<Array<string | number>>): string {
  const quote = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
  return '\uFEFF' + [HEADERS, ...data].map(r => r.map(quote).join(';')).join('\r\n');
}

export async function GET(req: Request) {
  const access = accessFor(req);
  if (!access) return NextResponse.json({ error: 'Неверный партнёрский ключ' }, { status: 401 });

  const url = new URL(req.url);
  const bounds = monthBounds(url.searchParams.get('month'));
  try {
    const report = await backend('partnerBillingReport', [access.sourceId, bounds.from, bounds.to]);
    const format = url.searchParams.get('format') ?? 'json';
    const table = rows(report.events ?? []);
    const filename = `jobtoo-${access.sourceId}-${bounds.month}`;

    if (format === 'csv') {
      return new Response(csv(table), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (format === 'xlsx') {
      return new Response(makeXlsx(HEADERS, table), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return NextResponse.json({ partner: access.name, month: bounds.month, ...report }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
