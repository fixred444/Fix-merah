'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';

const SECTIONS = {
  kirim: { icon: 'ðŸ“¨', title: 'Kirim permohonan', hint: 'Ketik nomor, pilih teks, lalu kirim' },
  akun: { icon: 'ðŸ”‘', title: 'Akun Gmail', hint: 'Tambah atau hapus akun pengirim' },
  riwayat: { icon: 'ðŸ•˜', title: 'Riwayat', hint: 'Lihat pengiriman sebelumnya' },
};

function Dashboard() {
  const [view, setView] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [opt, setOpt] = useState({ templates: [], targets: [] });
  const [hist, setHist] = useState({ items: [], today: 0, limit: 10 });
  const [sel, setSel] = useState({ accountId: '', templateId: '', targetId: '' });
  const [senderMode, setSenderMode] = useState('personal');
  const [acc, setAcc] = useState({ email: '', appPassword: '', sharedEnabled: true });
  const [globalTotal, setGlobalTotal] = useState(0);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replied, setReplied] = useState(null); // { phone } saat WhatsApp sudah membalas
  const [until, setUntil] = useState(0);        // waktu selesai hitung mundur (ms)
  const [now, setNow] = useState(() => Date.now());
  const [watch, setWatch] = useState({ err: '', at: 0 }); // status pengecekan balasan

  const load = useCallback(async () => {
    const [a, n, o, h] = await Promise.all([api('/api/accounts'), api('/api/numbers'), api('/api/options'), api('/api/history')]);
    setAccounts(a.items); setGlobalTotal(a.globalTotal || 0); setNumbers(n.items); setOpt(o); setHist(h);
    setSel((s) => ({
      accountId: a.items.some((x) => x.id === s.accountId) ? s.accountId : a.items[0]?.id || '',
      templateId: s.templateId || o.templates[0]?.id || '',
      targetId: s.targetId || o.targets[0]?.id || '',
    }));
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ err: true, t: e.message })); }, [load]);

  // Pulihkan hitung mundur kalau halaman dimuat ulang saat masih berjalan.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('fm_reply') || 'null');
      if (s && s.until > Date.now()) { setReplied({ phone: s.phone }); setUntil(s.until); setNow(Date.now()); }
    } catch {}
  }, []);

  // Detak hitung mundur.
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() >= until) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, [until]);

  const gotReply = useCallback((phone) => {
    const end = Date.now() + 60000;
    setReplied({ phone }); setUntil(end); setNow(Date.now());
    try { localStorage.setItem('fm_reply', JSON.stringify({ phone, until: end })); } catch {}
    try { if (navigator.vibrate) navigator.vibrate(200); } catch {}
  }, []);

  // Cek balasan WhatsApp di Gmail untuk pengiriman terbaru yang belum dibalas (selama halaman terbuka).
  const pending = hist.items
    .filter((h) => h.status === 'terkirim' && !h.replied_at && Date.now() - new Date(h.created_at).getTime() < 24 * 3600e3)
    .slice(0, 3).map((h) => h.id).join(',');
  useEffect(() => {
    if (!pending) return undefined;
    let stop = false; let working = false;
    const tick = async () => {
      if (working || stop) return;
      working = true;
      for (const id of pending.split(',')) {
        if (stop) break;
        try {
          const r = await api(`/api/reply?id=${id}`);
          if (!stop) setWatch({ err: r.error || '', at: Date.now() });
          if (r.replied && !stop) { gotReply(r.phone); await load(); break; }
        } catch (e) { if (!stop) setWatch({ err: e.message || 'Gagal cek balasan', at: Date.now() }); }
      }
      working = false;
    };
    const first = setTimeout(tick, 5000);
    const t = setInterval(tick, 20000);
    return () => { stop = true; clearTimeout(first); clearInterval(t); };
  }, [pending, gotReply, load]);

  const run = async (fn, okText) => {
    setMsg(null); setBusy(true);
    try { await fn(); if (okText) setMsg({ t: okText }); await load(); }
    catch (e) { setMsg({ err: true, t: e.message }); }
    setBusy(false);
  };
  const open = (id) => { setView(id); setMsg(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };

  const wait = Math.max(0, Math.ceil((until - now) / 1000));
  const clock = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;
  const ready = (senderMode === 'global' || sel.accountId) && phone.trim() && sel.templateId && sel.targetId && wait === 0;
  const pct = Math.min(100, Math.round((hist.today / Math.max(1, hist.limit)) * 100));
  const counts = { akun: accounts.length, riwayat: hist.items.length };

  const closeReply = () => { setReplied(null); try { localStorage.removeItem('fm_reply'); } catch {} };
  const banner = replied && (
    <section className="card fade" role="status" aria-live="polite">
      <b>ðŸ’¬ WhatsApp sudah merespon{replied.phone ? ` (${replied.phone})` : ''}</b>
      {wait > 0 ? (
        <>
          <p className="muted">Tunggu dulu sebelum mengirim lagi.</p>
          <b className="big">{clock}</b>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={60} aria-valuenow={wait}><i style={{ width: `${(wait / 60) * 100}%` }} /></div>
        </>
      ) : (
        <>
          <p className="muted">Waktu tunggu selesai. Silakan cek WhatsApp-mu.</p>
          <button type="button" className="chip" onClick={closeReply}>Tutup</button>
        </>
      )}
    </section>
  );
  const waiting = !replied && pending && hist.items.find((h) => h.id === pending.split(',')[0]);
  const waitCard = waiting && (
    <section className="card fade" role="status" aria-live="polite">
      <b>â³ Menunggu balasan WhatsApp{waiting.phone ? ` untuk ${waiting.phone}` : ''}â€¦</b>
      <p className="muted">Dicek otomatis tiap 20 detik selama halaman ini terbuka.</p>
      {watch.err && <p className="note err">{watch.err}</p>}
    </section>
  );
  const note = (
    <>
      {msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>}
      {banner}
      {waitCard}
    </>
  );

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
      <button type="button" className="chip back" onClick={() => open(null)}>â† Menu</button>
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
              <b>Sender Global</b><small>{globalTotal} sender aktif Â· giliran otomatis</small>
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
              if (result.senderEmail) setMsg({ t: `Email terkirim melalui ${result.senderEmail}. Kamu akan diberi tahu saat WhatsApp merespon (biarkan halaman ini terbuka).` });
            }, 'Email terkirim.')}>
            {busy ? 'Mengirimâ€¦' : wait > 0 ? `Tunggu ${clock}` : 'Kirim sekarang'}
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
          <p className="muted">App Password disimpan terenkripsi dan tidak pernah ditampilkan lagi. Sender Global saat ini: {globalTotal} akun.</p>
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
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/accounts', { method: 'POST', body: JSON.stringify(acc) }); setAcc({ email: '', appPassword: '', sharedEnabled: true }); }, acc.sharedEnabled ? 'Akun ditambahkan dan masuk Sender Global.' : 'Akun ditambahkan (pribadi saja).'); }}>
            <label>Email Gmail<input type="email" required placeholder="kamu@gmail.com" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></label>
            <label>App password<input type="password" required placeholder="16 karakter" value={acc.appPassword} onChange={(e) => setAcc({ ...acc, appPassword: e.target.value })} autoComplete="off" /></label>
            <label className="inline"><input type="checkbox" checked={acc.sharedEnabled} onChange={(e) => setAcc({ ...acc, sharedEnabled: e.target.checked })} /> Masukkan ke Sender Global</label>
            <p className="fine">{acc.sharedEnabled ? 'Akun ini ikut dipakai bergiliran oleh pengguna lain untuk mengirim email. Batas harian tiap sender tetap berlaku. Hapus centang kalau hanya mau dipakai sendiri.' : 'Akun ini hanya dipakai olehmu.'}</p>
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
                <small className="muted">{h.template_title} Â· dari {h.account_email}</small>
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
