import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/requireAdmin';

async function call(fn: string, args: unknown[]) {
  const secret = process.env.EXPO_PUBLIC_APP_SECRET;
  if (!secret) throw new Error('EXPO_PUBLIC_APP_SECRET не задан');
  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': secret, 'X-Admin-Token': process.env.ADMIN_API_TOKEN ?? '' },
    body: JSON.stringify({ fn, args }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error || json.data?.error) throw new Error(json.error ?? json.data?.error ?? 'Ошибка backend');
  return json.data;
}

function bounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Неверный месяц');
  const [y, m] = month.split('-').map(Number);
  return [month + '-01', new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const source = url.searchParams.get('source') ?? '';
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  try {
    const [from, to] = bounds(month);
    const [tariffs, report] = await Promise.all([
      call('partnerTariffsList', [source]),
      source ? call('partnerBillingReport', [source, from, to]) : Promise.resolve(null),
    ]);
    return NextResponse.json({ tariffs, report });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    if (body.tariff) return NextResponse.json(await call('partnerTariffSave', [body.tariff]));
    if (body.event) return NextResponse.json(await call('partnerBillableEventRecord', [body.event]));
    if (body.reconciliation) return NextResponse.json(await call('partnerReconciliationRecord', [body.reconciliation]));
    return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
