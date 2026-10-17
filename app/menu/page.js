'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';

function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [opt, setOpt] = useState({ templates: [], targets: [] });
  const [hist, setHist] = useState({ items: [], today: 0, limit: 10 });
  const [sel, setSel] = useState({ accountId: '', numberId: '', templateId: '', targetId: '' });
  const [senderMode, setSenderMode] = useState('personal');
  const [acc, setAcc] = useState({ email: '', appPassword: '' });
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, n, o, h] = await Promise.all([api('/api/accounts'), api('/api/numbers'), api('/api/options'), api('/api/history')]);
    setAccounts(a.items); setNumbers(n.items); setOpt(o); setHist(h);
    setSel((s) => ({
      accountId: s.accountId || a.items[0]?.id || '', numberId: s.numberId || n.items[0]?.id || '',
      templateId: s.templateId || o.templates[0]?.id || '', targetId: s.targetId || o.targets[0]?.id || '',
    }));
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ err: true, t: e.message })); }, [load]);

  const run = async (fn, okText) => {
    setMsg(null); setBusy(true);
    try { await fn(); if (okText) setMsg({ t: okText }); await load(); }
    catch (e) { setMsg({ err: true, t: e.message }); }
    setBusy(false);
  };

  const ready = (senderMode === 'global' || sel.accountId) && sel.numberId && sel.templateId && sel.targetId;

  return (
    <>
      {msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>}

      <section className="card">
        <h2>Kirim permohonan</h2>
        <p className="muted">Kuota hari ini: {hist.today} dari {hist.limit} pengiriman. Gunakan email secara wajar dan hanya untuk permohonan yang benar.</p>
        <label>Mode pengirim<select value={senderMode} onChange={(e) => setSenderMode(e.target.value)}><option value="personal">Sender Pribadi</option><option value="global">Sender Global (rotasi otomatis)</option></select></label>
        {senderMode === 'global' && <p className="muted">Pengirim dipilih bergiliran dari akun yang pemiliknya mengaktifkan berbagi. Batas harian tiap pengirim tetap berlaku.</p>}
        <div className="grid">
          {senderMode === 'personal' && <label>Akun Gmail
            <select value={sel.accountId} onChange={(e) => setSel({ ...sel, accountId: e.target.value })}>
              {accounts.length === 0 && <option value="">Belum ada akun</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </label>}
          <label>Nomor
            <select value={sel.numberId} onChange={(e) => setSel({ ...sel, numberId: e.target.value })}>
              {numbers.length === 0 && <option value="">Belum ada nomor</option>}
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.phone}</option>)}
            </select>
          </label>
          <label>Teks permohonan
            <select value={sel.templateId} onChange={(e) => setSel({ ...sel, templateId: e.target.value })}>
              {opt.templates.length === 0 && <option value="">Admin belum menambah teks</option>}
              {opt.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
          <label>Tujuan
            <select value={sel.targetId} onChange={(e) => setSel({ ...sel, targetId: e.target.value })}>
              {opt.targets.length === 0 && <option value="">Admin belum menambah tujuan</option>}
              {opt.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <button className="btn" disabled={!ready || busy}
          onClick={() => run(async () => { const result = await api('/api/send', { method: 'POST', body: JSON.stringify({ ...sel, senderMode }) }); if (result.senderEmail) setMsg({ t: `Email terkirim melalui ${result.senderEmail}.` }); }, 'Email terkirim.')}>
          {busy ? 'Mengirim…' : 'Kirim sekarang'}
        </button>
      </section>

      <div className="two">
        <section className="card">
          <h2>Akun Gmail</h2>
          <p className="muted">App Password disimpan terenkripsi dan tidak pernah ditampilkan lagi. Aktifkan berbagi hanya jika kamu benar-benar setuju akun dipakai pengguna lain.</p>
          <ul className="list">
            {accounts.map((a) => (
              <li key={a.id}><span>{a.email}<br /><small className="muted">{a.shared_enabled ? 'Ikut Sender Global' : 'Pribadi saja'}</small><br /><button className="link" onClick={() => run(() => api('/api/accounts', { method: 'PATCH', body: JSON.stringify({ id: a.id, sharedEnabled: !a.shared_enabled }) }), a.shared_enabled ? 'Akun dikeluarkan dari Sender Global.' : 'Akun ikut Sender Global.')}>{a.shared_enabled ? 'Matikan berbagi' : 'Izinkan berbagi'}</button></span>
                <button className="link danger" onClick={() => run(() => api(`/api/accounts?id=${a.id}`, { method: 'DELETE' }))}>Hapus</button></li>
            ))}
            {accounts.length === 0 && <li className="muted">Belum ada akun.</li>}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/accounts', { method: 'POST', body: JSON.stringify(acc) }); setAcc({ email: '', appPassword: '' }); }, 'Akun ditambahkan.'); }}>
            <label>Email Gmail<input type="email" required placeholder="kamu@gmail.com" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></label>
            <label>App password<input type="password" required placeholder="16 karakter" value={acc.appPassword} onChange={(e) => setAcc({ ...acc, appPassword: e.target.value })} autoComplete="off" /></label>
            <button className="btn small" disabled={busy}>Tambah akun</button>
          </form>
        </section>

        <section className="card">
          <h2>Nomor</h2>
          <p className="muted">Nomor WhatsApp milikmu yang ingin ditinjau, dengan kode negara.</p>
          <ul className="list">
            {numbers.map((n) => (
              <li key={n.id}><span>{n.phone}</span>
                <button className="link danger" onClick={() => run(() => api(`/api/numbers?id=${n.id}`, { method: 'DELETE' }))}>Hapus</button></li>
            ))}
            {numbers.length === 0 && <li className="muted">Belum ada nomor.</li>}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/numbers', { method: 'POST', body: JSON.stringify({ phone }) }); setPhone(''); }, 'Nomor ditambahkan.'); }}>
            <label>Nomor<input required placeholder="+628123456789" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
            <button className="btn small" disabled={busy}>Tambah nomor</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2>Riwayat</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Waktu</th><th>Dari</th><th>Nomor</th><th>Teks</th><th>Status</th></tr></thead>
            <tbody>
              {hist.items.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{h.account_email}</td><td>{h.phone}</td><td>{h.template_title}</td>
                  <td><span className={h.status === 'terkirim' ? 'tag ok' : 'tag err'}>{h.status}</span></td>
                </tr>
              ))}
              {hist.items.length === 0 && <tr><td colSpan={5} className="muted">Belum ada pengiriman.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function Menu() {
  return <Shell active="menu">{() => <Dashboard />}</Shell>;
}
