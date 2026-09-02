import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET ?? '';
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || !given) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

async function call(fn: string, args: unknown[]) {
  const secret = process.env.EXPO_PUBLIC_APP_SECRET;
  const admin = process.env.ADMIN_API_TOKEN;
  if (!secret || !admin) throw new Error('Backend secrets are not configured');
  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': secret, 'X-Admin-Token': admin },
    body: JSON.stringify({ fn, args }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error || json.data?.error) throw new Error(json.error ?? json.data?.error ?? 'Backend error');
  return json.data;
}

function previousMonth() {
  const now = new Date();
  const firstThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastPrev = new Date(firstThis.getTime() - 86400000);
  const month = lastPrev.toISOString().slice(0, 7);
  return { from: month + '-01', to: lastPrev.toISOString().slice(0, 10), month };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const period = previousMonth();
  try {
    const sources = await call('extSourcesList', []);
    const production = (sources ?? []).filter((s: any) => s.environment === 'production');
    const generated = [];
    for (const source of production) {
      const report = await call('partnerBillingReport', [source.id, period.from, period.to]);
      const canonical = JSON.stringify(report);
      const checksum = createHash('sha256').update(canonical).digest('hex');
      await call('partnerReportSnapshotSave', [{
        source_id: source.id,
        period_start: period.from,
        period_end: period.to,
        checksum_sha256: checksum,
        event_count: report.summary.events,
        amount_rub: report.summary.amount_rub,
        approved_count: report.summary.approved,
        rejected_count: report.summary.rejected,
        discrepancy_count: report.summary.open_discrepancies,
      }]);
      generated.push({ source_id: source.id, month: period.month, checksum, summary: report.summary });
    }
    return NextResponse.json({ ok: true, generated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
