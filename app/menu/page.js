'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';
import Stories from '@/components/Stories';
import Reviews from '@/components/Reviews';
import GlobalChat from '@/components/GlobalChat';
import People from '@/components/People';
import Profile from '@/components/Profile';
import DirectMessages from '@/components/DirectMessages';
import Avatar from '@/components/Avatar';
import WeatherCard from '@/components/WeatherCard';
import Verified from '@/components/Verified';

const SECTIONS = {
  kirim: { icon: '\u{1F4E8}', title: 'Kirim permohonan', hint: 'Ketik nomor, pilih teks, lalu kirim' },
  akun: { icon: '\u{1F511}', title: 'Akun Gmail', hint: 'Tambah atau hapus akun pengirim' },
  riwayat: { icon: '\u{1F558}', title: 'Riwayat', hint: 'Lihat pengiriman sebelumnya' },
  ulasan: { icon: '\u2B50', title: 'Ulasan', hint: 'Beri ulasan, dibalas admin' },
  chat: { icon: '\u{1F4AC}', title: 'Chat global', hint: 'Ngobrol dengan semua pengguna' },
  orang: { icon: '\u{1F465}', title: 'Orang', hint: 'Cari pengguna dan ikuti' },
  dm: { icon: '\u2709\uFE0F', title: 'Pesan pribadi', hint: 'Chat privat dengan pengguna lain' },
  profil: { icon: '\u{1F464}', title: 'Profil', hint: 'Lihat dan ubah profilmu' },
};

function Dashboard({ me }) {
  const [view, setView] = useState(null);
  const [target, setTarget] = useState(null); // id pengguna untuk profil / DM
  const [dmUnread, setDmUnread] = useState(0);
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
          if (r.replied && !stop) {
            const fresh = r.repliedAt && Date.now() - new Date(r.repliedAt).getTime() < 10 * 60e3;
            if (fresh) gotReply(r.phone);
            await load();
            if (fresh) break;
          }
        } catch (e) { if (!stop) setWatch({ err: e.message || 'Gagal cek balasan', at: Date.now() }); }
      }
      working = false;
    };
    const first = setTimeout(tick, 5000);
    const t = setInterval(tick, 20000);
    return () => { stop = true; clearTimeout(first); clearInterval(t); };
  }, [pending, gotReply, load]);

  // Detak tiap detik selama menunggu balasan (untuk batas 3 menit).
  const newestId = pending ? pending.split(',')[0] : '';
  useEffect(() => {
    if (!newestId) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [newestId]);

  const run = async (fn, okText) => {
    setMsg(null); setBusy(true);
    try { await fn(); if (okText) setMsg({ t: okText }); await load(); }
    catch (e) { setMsg({ err: true, t: e.message }); }
    setBusy(false);
  };
  const open = (id) => { setView(id); setTarget(id === 'profil' ? 'me' : null); setMsg(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };
  const openProfile = (id) => { setTarget(id); setView('profil'); setMsg(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };
  const openDm = (id) => { setTarget(id); setView('dm'); setMsg(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };

  // Buka DM langsung dari ketukan notifikasi (/menu?dm=<id>).
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search); const id = sp.get('dm');
      const v = sp.get('v');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) { openDm(id); window.history.replaceState(null, '', '/menu'); }
      else if (v && SECTIONS[v]) { open(v); window.history.replaceState(null, '', '/menu'); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perintah pindah bagian dari panel menu (garis tiga) di Shell.
  useEffect(() => {
    const h = (e) => { const v = e.detail && e.detail.view; if (v === 'home') open(null); else if (SECTIONS[v]) open(v); };
    window.addEventListener('fm-nav', h);
    return () => window.removeEventListener('fm-nav', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jumlah pesan pribadi belum dibaca untuk lencana di menu.
  useEffect(() => {
    const tick = async () => { if (document.hidden) return; try { const r = await api('/api/dm?unread=1'); setDmUnread(r.unread || 0); } catch {} };
    tick(); const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [view]);

  const wait = Math.max(0, Math.ceil((until - now) / 1000));
  const clock = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;
  const ready = (senderMode === 'global' || sel.accountId) && phone.trim() && sel.templateId && sel.targetId && wait === 0;
  const pct = Math.min(100, Math.round((hist.today / Math.max(1, hist.limit)) * 100));

  const closeReply = () => { setReplied(null); try { localStorage.removeItem('fm_reply'); } catch {} };
  const banner = replied && (
    <section className="card fade" role="status" aria-live="polite">
      <b>{'\u{1F4AC}'} WhatsApp sudah merespon{replied.phone ? ` (${replied.phone})` : ''}</b>
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
  const elapsed = waiting ? now - new Date(waiting.created_at).getTime() : 0;
  const late = elapsed >= 180000;
  const otherMode = senderMode === 'personal' ? 'global' : 'personal';
  const retryOther = () => {
    setPhone(waiting.phone); setSenderMode(otherMode); open('kirim');
  };
  const waitCard = waiting && (
    <section className="card fade" role="status" aria-live="polite">
      {late ? (
        <>
          <b>{'\u26A0\uFE0F'} WhatsApp belum merespon{waiting.phone ? ` (${waiting.phone})` : ''}</b>
          <p className="muted">Sudah lebih dari 3 menit tanpa balasan. Coba kirim ulang dengan sender lain, atau pakai sender pribadimu.</p>
          <button type="button" className="chip" onClick={retryOther}>{otherMode === 'global' ? 'Coba Sender Global' : 'Coba Sender Pribadi'}</button>
        </>
      ) : (
        <>
          <b>{'\u23F3'} Menunggu balasan WhatsApp{waiting.phone ? ` untuk ${waiting.phone}` : ''}&hellip;</b>
          <p className="muted">Dicek otomatis tiap 20 detik selama halaman ini terbuka.</p>
        </>
      )}
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
    const role = me.isAdmin ? 'ADMIN' : me.status === 'beku' ? 'DIBEKUKAN' : 'PENGGUNA';
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <>
        {note}
        <WeatherCard />
        <section className="card welcome fade">
          <div className="wtop">
            <span className="wav"><Avatar name={me.name || me.email} size={64} /><i className="online" aria-label="Online" /></span>
            <div className="wtext">
              <small className="wkicker">SELAMAT DATANG KEMBALI</small>
              <b className="wname"><span>{me.name || me.email}</span>{me.verified && <Verified size={20} />}</b>
              <span className="wmeta"><span className="rolechip">{role}</span><small className="muted">{today}</small></span>
            </div>
          </div>
          <div className="meter" role="progressbar" aria-label="Kuota hari ini" aria-valuemin={0} aria-valuemax={hist.limit} aria-valuenow={hist.today}><i style={{ width: `${pct}%` }} /></div>
          <small className="muted">Kuota hari ini: {hist.today} dari {hist.limit} pengiriman terpakai</small>
        </section>
        <div className="statrow fade">
          <button type="button" className="statbtn g" onClick={() => open('riwayat')}><span aria-hidden="true">{'\u{1F4CA}'}</span><b>{hist.today}/{hist.limit}</b><small>KUOTA</small></button>
          <button type="button" className="statbtn b" onClick={() => open('dm')}><span aria-hidden="true">{'\u2709\uFE0F'}</span><b>{dmUnread}</b><small>PESAN BARU</small></button>
          <button type="button" className="statbtn r" onClick={() => open('akun')}><span aria-hidden="true">{'\u{1F511}'}</span><b>{accounts.length}</b><small>AKUN GMAIL</small></button>
        </div>
        <button type="button" className="btn bigcta fade" onClick={() => open('kirim')}>{'\u{1F4E8}'} Kirim permohonan</button>
        <Stories />
      </>
    );
  }

  const head = (
    <div className="pagehead">
      <button type="button" className="chip back" onClick={() => open(null)}>&larr; Menu</button>
      <div><h2>{SECTIONS[view].title}</h2></div>
    </div>
  );

  if (view === 'ulasan') return <Reviews head={head} onProfile={openProfile} />;
  if (view === 'chat') return <GlobalChat head={head} onProfile={openProfile} />;
  if (view === 'orang') return <People head={head} onProfile={openProfile} />;
  if (view === 'profil') return <Profile head={head} id={target || 'me'} onProfile={openProfile} onDm={openDm} />;
  if (view === 'dm') return <DirectMessages head={head} peerId={target} onPick={openDm} onFind={() => open('orang')} onProfile={openProfile} />;

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
              <b>Sender Global</b><small>{globalTotal} sender aktif &middot; giliran otomatis</small>
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
            {busy ? 'Mengirim\u2026' : wait > 0 ? `Tunggu ${clock}` : 'Kirim sekarang'}
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
                <small className="muted">{h.template_title} &middot; dari {h.account_email}</small>
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
  return <Shell active="menu">{(me) => <Dashboard me={me} />}</Shell>;
}
