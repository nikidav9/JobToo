'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import { getToken } from '@/lib/adminApi';

type Source = { id: string; name: string; environment: string };
type Tariff = { id: string; source_id: string; name: string; billing_model: string; amount_rub: number; effective_from: string; effective_to?: string | null; active: boolean };
type Report = { summary: any; events: any[]; discrepancies: any[] };

export default function PartnerBillingPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [amount, setAmount] = useState('');
  const [model, setModel] = useState('first_completed_shift');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() };

  useEffect(() => {
    fetch('/api/admin/ext-sources', { headers }).then(r => r.json()).then(d => {
      const prod = (d.items ?? []).filter((s: Source) => s.environment === 'production');
      setSources(prod); if (prod[0]) setSource(prod[0].id);
    }).catch(e => setError(e.message));
  }, []);

  async function load() {
    if (!source) return;
    setError('');
    const res = await fetch(`/api/admin/partner-billing?source=${encodeURIComponent(source)}&month=${month}`, { headers });
    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error ?? 'Ошибка'); return; }
    setTariffs(data.tariffs ?? []); setReport(data.report);
  }

  useEffect(() => { if (source) load(); }, [source, month]);

  async function saveTariff() {
    const res = await fetch('/api/admin/partner-billing', {
      method: 'POST', headers,
      body: JSON.stringify({ tariff: {
        source_id: source, name: model, billing_model: model,
        amount_rub: Number(amount), effective_from: from, terms_version: from, active: true,
      } }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error ?? 'Ошибка'); return; }
    setAmount(''); await load();
  }

  return <div className="page">
    <PageHeader title="Партнёрский биллинг" subtitle="Тарифы, оплачиваемые события и расхождения сверки" />
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="jt-card" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>Источник<select className="jt-input" value={source} onChange={e => setSource(e.target.value)}>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>Месяц<input className="jt-input" type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
        <Button onClick={load}>Обновить</Button>
      </div>

      <div className="jt-card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Новая версия тарифа</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Модель<select className="jt-input" value={model} onChange={e => setModel(e.target.value)}>
            <option value="first_completed_shift">Первая завершённая смена</option>
            <option value="completed_shift">Каждая завершённая смена</option>
            <option value="qualified_application">Квалифицированный отклик</option>
            <option value="fixed_monthly">Фиксировано в месяц</option>
            <option value="hybrid">Гибрид</option>
          </select></label>
          <label>Цена, ₽<input className="jt-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Действует с<input className="jt-input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <Button onClick={saveTariff} disabled={!source || !amount}>Сохранить версию</Button>
        </div>
      </div>

      {error ? <div className="jt-card" style={{ padding: 16, color: 'var(--negative)' }}>{error}</div> : null}

      <div className="jt-card" style={{ padding: 16, overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Тарифы источника</h3>
        <table className="jt-table"><thead><tr><th>Версия</th><th>Модель</th><th>Цена</th><th>С даты</th><th>Статус</th></tr></thead>
          <tbody>{tariffs.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.billing_model}</td><td>{Number(t.amount_rub).toLocaleString('ru-RU')} ₽</td><td>{t.effective_from}</td><td>{t.active ? 'активен' : 'закрыт'}</td></tr>)}</tbody>
        </table>
      </div>

      {report ? <>
        <div className="g-3">
          {Object.entries(report.summary).map(([k,v]) => <div className="jt-card" style={{ padding: 16 }} key={k}><div style={{ color: 'var(--ink-3)' }}>{k}</div><b className="num" style={{ fontSize: 24 }}>{String(v)}</b></div>)}
        </div>
        <div className="jt-card" style={{ padding: 16, overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Журнал оплачиваемых событий</h3>
          <table className="jt-table"><thead><tr><th>Кандидат</th><th>Событие</th><th>Дата</th><th>Сумма</th><th>Статус</th></tr></thead>
            <tbody>{report.events.map(e => <tr key={e.id}><td>{e.worker_id}</td><td>{e.event_kind}</td><td>{e.occurred_at}</td><td>{e.amount_rub} ₽</td><td>{e.status}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="jt-card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Журнал расхождений</h3>
          {!report.discrepancies.length ? <span style={{ color: 'var(--ink-3)' }}>Расхождений нет</span> :
            report.discrepancies.map(i => <div key={i.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <b>{i.local_status} → {i.partner_status}</b> · {i.reason_code}<div style={{ color: 'var(--ink-3)' }}>{i.reason_text ?? 'Без пояснения'} · {i.resolution_status}</div>
            </div>)}
        </div>
      </> : null}
    </div>
  </div>;
}
