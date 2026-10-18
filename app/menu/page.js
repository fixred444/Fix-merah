'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';

const SECTIONS = {
  kirim: { icon: '📨', title: 'Kirim permohonan', hint: 'Ketik nomor, pilih teks, lalu kirim' },
  akun: { icon: '🔑', title: 'Akun Gmail', hint: 'Tambah atau hapus akun pengirim' },
  riwayat: { icon: '🕘', title: 'Riwayat', hint: 'Lihat pengiriman sebelumnya' },
};

function Dashboard() {
  const [view, setView] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [opt, setOpt] = useState({ templates: [], targets: [] });
  const [hist, setHist] = useState({ items: [], today: 0, limit: 10 });
  const [sel, setSel] = useState({ accountId: '', templateId: '', targetId: '' });
  const [senderMode, setSenderMode] = useState('personal');
  const [acc, setAcc] = useState({ email: '', appPassword: '' });
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, n, o, h] = await Promise.all([api('/api/accounts'), api('/api/numbers'), api('/api/options'), api('/api/history')]);
    setAccounts(a.items); setNumbers(n.items); setOpt(o); setHist(h);
    setSel((s) => ({
      accountId: a.items.some((x) => x.id === s.accountId) ? s.accountId : a.items[0]?.id || '',
      templateId: s.templateId || o.templates[0]?.id || '',
      targetId: s.targetId || o.targets[0]?.id || '',
    }));
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ err: true, t: e.message })); }, [load]);

  const run = async (fn, okText) => {
    setMsg(null); setBusy(true);
    try { await fn(); if (okText) setMsg({ t: okText }); await load(); }
    catch (e) { setMsg({ err: true, t: e.message }); }
    setBusy(false);
  };
  const open = (id) => { setView(id); setMsg(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };

  const ready = (senderMode === 'global' || sel.accountId) && phone.trim() && sel.templateId && sel.targetId;
  const pct = Math.min(100, Math.round((hist.today / Math.max(1, hist.limit)) * 100));
  const counts = { akun: accounts.length, riwayat: hist.items.length };

  const note = msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>;

  if (!view) {
    return (
      <>
        {note}
        <section className="card stat fade">
          <div><span className="muted">Kuota hari ini</span><b className="big">{hist.today}</b><span className="muted">dari {hist.limit} pengiriman</span></div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={hist.limit} aria-valuenow={hist.today}><i style={{ width: `${pct}%` }} /></div>
        </section>
        <div className="hub fade">
          {Object.entries(SECTIONS).map(([id, s]) => (
            <button key={id} type="button" className={id === 'kirim' ? 'card tile wide' : 'card tile'} onClick={() => open(id)}>
              <span className="ticon" aria-hidden="true">{s.icon}</span>
              <span className="ttext"><b>{s.title}</b><small className="muted">{s.hint}</small></span>
              {typeof counts[id] === 'number' && <span className="badge">{counts[id]}</span>}
            </button>
          ))}
        </div>
      </>
    );
  }

  const head = (
    <div className="pagehead">
      <button type="button" className="chip back" onClick={() => open(null)}>← Menu</button>
      <div><h2>{SECTIONS[view].title}</h2></div>
    </div>
  );

  if (view === 'kirim') {
    const missing = [];
    if (senderMode === 'personal' && !sel.accountId) missing.push({ t: 'Tambah akun Gmail dulu', to: 'akun' });
    if (!opt.templates.length) missing.push({ t: 'Admin belum menambah teks permohonan' });
    if (!opt.targets.length) missing.push({ t: 'Admin belum menambah email tujuan' });
    return (
      <>
        {note}
        <section className="card fade">
          {head}
          <div className="choice" role="group" aria-label="Mode pengirim">
            <button type="button" aria-pressed={senderMode === 'personal'} className={senderMode === 'personal' ? 'opt on' : 'opt'} onClick={() => setSenderMode('personal')}>
              <b>Sender Pribadi</b><small>Pakai Gmail milikmu</small>
            </button>
            <button type="button" aria-pressed={senderMode === 'global'} className={senderMode === 'global' ? 'opt on' : 'opt'} onClick={() => setSenderMode('global')}>
              <b>Sender Global</b><small>Gilir dari akun yang mengizinkan</small>
            </button>
          </div>
          <div className="grid">
            {senderMode === 'personal' && <label>Akun Gmail
              <select value={sel.accountId} onChange={(e) => setSel({ ...sel, accountId: e.target.value })}>
                {accounts.length === 0 && <option value="">Belum ada akun</option>}
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            </label>}
            <label>Nomor
              <input required placeholder="+628123456789" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
              {numbers.length > 0 && (
                <span className="picks">
                  {numbers.slice(-3).reverse().map((n) => (
                    <button key={n.id} type="button" className="chip" onClick={() => setPhone(n.phone)}>{n.phone}</button>
                  ))}
                </span>
              )}
            </label>
            <label>Teks permohonan
              <select value={sel.templateId} onChange={(e) => setSel({ ...sel, templateId: e.target.value })}>
                {opt.templates.length === 0 && <option value="">Belum ada teks</option>}
                {opt.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <label>Tujuan
              <select value={sel.targetId} onChange={(e) => setSel({ ...sel, targetId: e.target.value })}>
                {opt.targets.length === 0 && <option value="">Belum ada tujuan</option>}
                {opt.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          {missing.length > 0 && (
            <ul className="todo">
              {missing.map((m) => (
                <li key={m.t}>{m.to ? <button type="button" className="link" onClick={() => open(m.to)}>{m.t}</button> : m.t}</li>
              ))}
            </ul>
          )}
          <button className="btn" disabled={!ready || busy}
            onClick={() => run(async () => {
              const clean = phone.replace(/[\s-]/g, '');
              if (!/^\+?\d{8,15}$/.test(clean)) throw new Error('Nomor tidak valid. Contoh: +628123456789');
              let num = numbers.find((x) => x.phone === clean);
              if (!num) {
                await api('/api/numbers', { method: 'POST', body: JSON.stringify({ phone: clean }) });
                const fresh = await api('/api/numbers');
                num = fresh.items.find((x) => x.phone === clean);
                if (!num) throw new Error('Nomor gagal disimpan, coba lagi.');
              }
              const result = await api('/api/send', { method: 'POST', body: JSON.stringify({ ...sel, numberId: num.id, senderMode }) });
              if (result.senderEmail) setMsg({ t: `Email terkirim melalui ${result.senderEmail}.` });
            }, 'Email terkirim.')}>
            {busy ? 'Mengirim…' : 'Kirim sekarang'}
          </button>
          <p className="fine">Sisa kuota hari ini: {Math.max(0, hist.limit - hist.today)}. Gunakan hanya untuk permohonan yang benar.</p>
        </section>
      </>
    );
  }

  if (view === 'akun') {
    return (
      <>
        {note}
        <section className="card fade">
          {head}
          <p className="muted">App Password disimpan terenkripsi dan tidak pernah ditampilkan lagi.</p>
          <ul className="list">
            {accounts.map((a) => (
              <li key={a.id}>
                <span className="grow"><b>{a.email}</b><small className="muted">{a.shared_enabled ? 'Ikut Sender Global' : 'Pribadi saja'}</small></span>
                <span className="acts">
                  <button className="chip" onClick={() => run(() => api('/api/accounts', { method: 'PATCH', body: JSON.stringify({ id: a.id, sharedEnabled: !a.shared_enabled }) }), a.shared_enabled ? 'Akun dikeluarkan dari Sender Global.' : 'Akun ikut Sender Global.')}>{a.shared_enabled ? 'Matikan berbagi' : 'Izinkan berbagi'}</button>
                  <button className="chip danger" onClick={() => run(() => api(`/api/accounts?id=${a.id}`, { method: 'DELETE' }), 'Akun dihapus.')}>Hapus</button>
                </span>
              </li>
            ))}
            {accounts.length === 0 && <li className="empty">Belum ada akun. Tambahkan di bawah.</li>}
          </ul>
          <h3>Tambah akun</h3>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/accounts', { method: 'POST', body: JSON.stringify(acc) }); setAcc({ email: '', appPassword: '' }); }, 'Akun ditambahkan.'); }}>
            <label>Email Gmail<input type="email" required placeholder="kamu@gmail.com" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></label>
            <label>App password<input type="password" required placeholder="16 karakter" value={acc.appPassword} onChange={(e) => setAcc({ ...acc, appPassword: e.target.value })} autoComplete="off" /></label>
            <p className="fine">Aktifkan berbagi hanya jika kamu setuju akun dipakai pengguna lain.</p>
            <button className="btn small" disabled={busy}>Tambah akun</button>
          </form>
        </section>
      </>
    );
  }

  return (
    <>
      {note}
      <section className="card fade">
        {head}
        <ul className="list">
          {hist.items.map((h) => (
            <li key={h.id}>
              <span className="grow">
                <b>{h.phone}</b>
                <small className="muted">{h.template_title} · dari {h.account_email}</small>
                <small className="muted">{new Date(h.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</small>
              </span>
              <span className={h.status === 'terkirim' ? 'tag ok' : 'tag err'}>{h.status}</span>
            </li>
          ))}
          {hist.items.length === 0 && <li className="empty">Belum ada pengiriman.</li>}
        </ul>
      </section>
    </>
  );
}

export default function Menu() {
  return <Shell active="menu">{() => <Dashboard />}</Shell>;
}
