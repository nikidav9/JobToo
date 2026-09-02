'use client';
import { useEffect, useState } from 'react';

type Report = {
  partner: string;
  month: string;
  summary: { events: number; approved: number; rejected: number; open_discrepancies: number; amount_rub: number };
  events: Array<any>;
  discrepancies: Array<any>;
};

export default function PartnerPortalPage() {
  const [token, setToken] = useState('');
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7);
  });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setToken(sessionStorage.getItem('jobtoo_partner_token') ?? ''); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/partner/report?month=${month}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка');
      sessionStorage.setItem('jobtoo_partner_token', token);
      setReport(data);
    } catch (e: any) { setReport(null); setError(e.message); }
    setLoading(false);
  }

  async function download(format: 'csv' | 'xlsx') {
    setError('');
    try {
      const res = await fetch(`/api/partner/report?month=${month}&format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Ошибка выгрузки'); }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = href; a.download = `jobtoo-report-${month}.${format}`; a.click();
      URL.revokeObjectURL(href);
    } catch (e: any) { setError(e.message); }
  }

  const box = { border: '1px solid #e1e4e8', borderRadius: 14, padding: 16, background: '#fff' };
  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: 24, color: '#181b20' }}>
      <h1 style={{ marginBottom: 4 }}>JobToo · кабинет партнёра</h1>
      <p style={{ color: '#667085', marginTop: 0 }}>Только чтение: собственные события, суммы и расхождения.</p>

      <section style={{ ...box, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ flex: '1 1 280px' }}>Партнёрский ключ
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 5, boxSizing: 'border-box' }} />
        </label>
        <label>Месяц
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ display: 'block', padding: 10, marginTop: 5 }} />
        </label>
        <button onClick={load} disabled={!token || loading} style={{ padding: '11px 18px' }}>
          {loading ? 'Загрузка…' : 'Показать'}
        </button>
      </section>

      {error ? <p style={{ color: '#b42318' }}>{error}</p> : null}
      {report ? <>
        <h2>{report.partner} · {report.month}</h2>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          {[
            ['Событий', report.summary.events], ['Подтверждено', report.summary.approved],
            ['Отклонено', report.summary.rejected], ['Открытых расхождений', report.summary.open_discrepancies],
            ['К оплате', report.summary.amount_rub.toLocaleString('ru-RU') + ' ₽'],
          ].map(([label, value]) => <div key={String(label)} style={box}><div style={{ color: '#667085', fontSize: 13 }}>{label}</div><b style={{ fontSize: 24 }}>{value}</b></div>)}
        </section>

        <div style={{ display: 'flex', gap: 10, margin: '16px 0' }}>
          <button onClick={() => download('csv')}>Скачать CSV</button>
          <button onClick={() => download('xlsx')}>Скачать XLSX</button>
        </div>

        <section style={{ ...box, overflowX: 'auto' }}>
          <h3>Оплачиваемые события</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>{['Кандидат','Событие','Дата','Сумма','JobToo','Партнёр'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>{h}</th>)}</tr></thead>
            <tbody>{report.events.map(e => <tr key={e.id}>
              <td style={{ padding: 8 }}>{e.worker_id}</td><td>{e.event_kind}</td><td>{e.occurred_at}</td>
              <td>{Number(e.amount_rub).toLocaleString('ru-RU')} ₽</td><td>{e.status}</td><td>{e.partner_status ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </section>

        <section style={{ ...box, marginTop: 16, overflowX: 'auto' }}>
          <h3>Расхождения</h3>
          {!report.discrepancies.length ? <p style={{ color: '#667085' }}>Открытых записей нет.</p> :
            report.discrepancies.map(i => <div key={i.id} style={{ borderTop: '1px solid #eee', padding: '10px 0' }}>
              <b>{i.local_status} → {i.partner_status}</b> · {i.reason_code}
              <div style={{ color: '#667085' }}>{i.reason_text ?? 'Без пояснения'} · {i.resolution_status}</div>
            </div>)}
        </section>
      </> : null}
    </main>
  );
}
