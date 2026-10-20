'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, supabase } from '@/lib/client';
import Shell from '@/components/Shell';
import AdminVerify from '@/components/AdminVerify';

function ago(iso) {
  if (!iso) return 'belum pernah';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'hari ini';
  if (d < 30) return `${d} hari lalu`;
  if (d < 365) return `${Math.floor(d / 30)} bulan lalu`;
  return `${Math.floor(d / 365)} tahun lalu`;
}

function Users({ onMsg }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => { setData(await api('/api/admin/users')); }, []);
  useEffect(() => { load().catch((e) => onMsg({ err: true, t: e.message })); }, [load, onMsg]);

  const change = async (u, status) => {
    const verb = { beku: 'membekukan', nonaktif: 'menonaktifkan', aktif: 'mengaktifkan kembali' }[status];
    if (status !== 'aktif' && !window.confirm(`Yakin ${verb} ${u.email}?`)) return;
    let note = '';
    if (status !== 'aktif') { const n = window.prompt('Alasan (boleh dikosongkan)', ''); if (n === null) return; note = n; }
    setBusyId(u.id); onMsg(null);
    try {
      await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, status, note }) });
      onMsg({ t: status === 'aktif' ? 'Pengguna diaktifkan kembali.' : status === 'beku' ? 'Pengguna dibekukan.' : 'Pengguna dinonaktifkan.' });
      await load();
    } catch (e) { onMsg({ err: true, t: e.message }); }
    setBusyId('');
  };

  if (!data) return <section className="card fade"><p className="muted">Memuat pengguna&hellip;</p></section>;
  const items = data.items.filter((u) => u.email.includes(q.trim().toLowerCase()));
  const n = (s) => data.items.filter((u) => u.status === s).length;
  const tagClass = { aktif: 'tag ok', beku: 'tag warn', nonaktif: 'tag err' };

  return (
    <section className="card fade">
      <h2>Pengguna</h2>
      <p className="muted">{data.items.length} terdaftar &middot; {n('aktif')} aktif &middot; {n('beku')} beku &middot; {n('nonaktif')} nonaktif</p>
      {!data.statusReady && <p className="note err">Tabel status belum ada. Jalankan SQL terbaru (bagian user_status) di Supabase supaya bekukan dan nonaktifkan bisa dipakai.</p>}
      <p className="hint"><b>Beku</b>: masih bisa masuk dan melihat data, tapi tidak bisa mengirim, dan akun Gmail-nya keluar dari Sender Global. <b>Nonaktif</b>: tidak bisa memakai menu sama sekali.</p>
      <input type="search" placeholder="Cari email pengguna" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari email pengguna" />
      <ul className="list">
        {items.map((u) => (
          <li key={u.id}>
            <span className="grow">
              <b>{u.email}</b>
              <small className="muted">Daftar {ago(u.createdAt)} &middot; terakhir masuk {ago(u.lastSignIn)}</small>
              <small className="muted">{u.accounts} akun Gmail ({u.shared} di Sender Global) &middot; {u.sent} terkirim ({u.today} hari ini)</small>
              <small className="muted">Tujuan terakhir: {u.lastTarget || 'belum ada'}</small>
              {u.note && <small className="muted">Alasan: {u.note}</small>}
            </span>
            <span className="acts">
              {u.isAdmin ? <span className="tag ok">Admin</span> : <>
                <span className={tagClass[u.status]}>{u.status}</span>
                {u.status !== 'aktif' && <button className="chip" disabled={busyId === u.id} onClick={() => change(u, 'aktif')}>Aktifkan kembali</button>}
                {u.status === 'aktif' && <button className="chip" disabled={busyId === u.id} onClick={() => change(u, 'beku')}>Bekukan</button>}
                {u.status !== 'nonaktif' && <button className="chip danger" disabled={busyId === u.id} onClick={() => change(u, 'nonaktif')}>Nonaktifkan</button>}
              </>}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="empty">Tidak ada pengguna yang cocok.</li>}
      </ul>
    </section>
  );
}

function Gmails({ onMsg }) {
  const [data, setData] = useState(null);
  const [onlyBad, setOnlyBad] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [progress, setProgress] = useState('');

  const load = useCallback(async () => { setData(await api('/api/admin/accounts')); }, []);
  useEffect(() => { load().catch((e) => onMsg({ err: true, t: e.message })); }, [load, onMsg]);

  const remove = async (a) => {
    if (!window.confirm(`Hapus akun Gmail ${a.email} milik ${a.owner}? Pemilik bisa menambahkannya lagi dengan App Password baru.`)) return;
    setBusyId(a.id); onMsg(null);
    try { await api(`/api/admin/accounts?id=${a.id}`, { method: 'DELETE' }); onMsg({ t: 'Akun Gmail dihapus.' }); await load(); }
    catch (e) { onMsg({ err: true, t: e.message }); }
    setBusyId('');
  };
  const check = async (a) => {
    const r = await api('/api/admin/accounts', { method: 'POST', body: JSON.stringify({ id: a.id }) });
    return r.valid;
  };
  const checkOne = async (a) => {
    setBusyId(a.id); onMsg(null);
    try {
      const v = await check(a);
      onMsg(v === false ? { err: true, t: `${a.email}: App Password salah.` } : v ? { t: `${a.email}: login normal.` } : { t: 'Belum bisa dicek, coba lagi nanti.' });
      await load();
    } catch (e) { onMsg({ err: true, t: e.message }); }
    setBusyId('');
  };
  const checkAll = async () => {
    onMsg(null);
    let bad = 0; const list = data.items;
    try {
      for (let i = 0; i < list.length; i += 1) {
        setProgress(`Mengecek ${i + 1} dari ${list.length}...`);
        if ((await check(list[i])) === false) bad += 1;
      }
      onMsg({ t: bad ? `Selesai. ${bad} akun App Password-nya salah.` : 'Selesai. Semua akun login normal.' });
      await load();
    } catch (e) { onMsg({ err: true, t: e.message }); }
    setProgress('');
  };

  if (!data) return <section className="card fade"><p className="muted">Memuat akun Gmail&hellip;</p></section>;
  const badCount = data.items.filter((a) => a.failedAt).length;
  const items = onlyBad ? data.items.filter((a) => a.failedAt) : data.items;

  return (
    <section className="card fade">
      <h2>Akun Gmail</h2>
      <p className="muted">{data.items.length} akun &middot; {badCount} App Password salah</p>
      {!data.columnReady && <p className="note err">Kolom penanda belum ada. Jalankan SQL terbaru (login_failed_at) di Supabase supaya akun yang salah otomatis ditandai.</p>}
      <p className="hint">Akun yang gagal login ditandai otomatis saat kirim, dan dilewati oleh Sender Global. Hapus akun bermasalah agar pemiliknya bisa menambahkannya lagi dengan App Password yang benar.</p>
      <div className="acts">
        <button className="chip" disabled={!!progress || !data.items.length} onClick={checkAll}>{progress || 'Cek semua login'}</button>
        <button className="chip" aria-pressed={onlyBad} onClick={() => setOnlyBad(!onlyBad)}>{onlyBad ? 'Tampilkan semua' : 'Hanya yang bermasalah'}</button>
      </div>
      <ul className="list">
        {items.map((a) => (
          <li key={a.id}>
            <span className="grow">
              <b>{a.email}</b>
              <small className="muted">Pemilik: {a.owner} &middot; {a.shared ? 'di Sender Global' : 'pribadi'}</small>
              {a.failedAt && <small className="muted">Gagal login {ago(a.failedAt)}{a.error ? `: ${a.error}` : ''}</small>}
            </span>
            <span className="acts">
              <span className={a.failedAt ? 'tag err' : 'tag ok'}>{a.failedAt ? 'App Password salah' : 'Normal'}</span>
              <button className="chip" disabled={busyId === a.id || !!progress} onClick={() => checkOne(a)}>Cek</button>
              <button className="chip danger" disabled={busyId === a.id || !!progress} onClick={() => remove(a)}>Hapus</button>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="empty">{onlyBad ? 'Tidak ada akun bermasalah.' : 'Belum ada akun Gmail.'}</li>}
      </ul>
    </section>
  );
}

const AUDIO_BY_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' };

function Notif({ onMsg }) {
  const [text, setText] = useState('');
  const [audio, setAudio] = useState(null);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState('');
  const [list, setList] = useState(null);
  const recRef = useRef(null);
  const chunks = useRef([]);
  const tick = useRef(null);
  const audioSrc = useMemo(() => (audio ? URL.createObjectURL(audio) : ''), [audio]);
  useEffect(() => () => { if (audioSrc) URL.revokeObjectURL(audioSrc); }, [audioSrc]);

  const load = useCallback(async () => { const r = await api('/api/announcements?all=1'); setList(r.items || []); }, []);
  useEffect(() => { load().catch((e) => onMsg({ err: true, t: e.message })); }, [load, onMsg]);

  const stopRec = useCallback(() => { const mr = recRef.current; if (mr && mr.state === 'recording') mr.stop(); }, []);
  useEffect(() => { if (rec && secs >= 60) stopRec(); }, [rec, secs, stopRec]);
  useEffect(() => () => { clearInterval(tick.current); stopRec(); }, [stopRec]);

  const startRec = async () => {
    onMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(tick.current);
        const type = (mr.mimeType || mime || 'audio/webm').split(';')[0];
        setAudio(new File([new Blob(chunks.current, { type })], type.includes('mp4') ? 'vn.m4a' : 'vn.webm', { type }));
        setRec(false);
      };
      mr.start();
      recRef.current = mr; setAudio(null); setSecs(0); setRec(true);
      tick.current = setInterval(() => setSecs((x) => x + 1), 1000);
    } catch { onMsg({ err: true, t: 'Mikrofon tidak bisa diakses. Izinkan akses mikrofon, atau unggah file audio.' }); }
  };

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const type = f.type.startsWith('audio/') ? f.type.split(';')[0] : AUDIO_BY_EXT[ext];
    if (!type) { onMsg({ err: true, t: 'Pilih file audio (MP3, M4A, AAC, OGG, WAV).' }); return; }
    if (f.size > 5 * 1048576) { onMsg({ err: true, t: 'VN maksimal 5 MB.' }); return; }
    onMsg(null);
    setAudio(new File([f], f.name, { type }));
  };

  const send = async () => {
    if (!text.trim() && !audio) { onMsg({ err: true, t: 'Isi teks atau rekam/unggah VN dulu.' }); return; }
    setBusy('Mengirim...'); onMsg(null);
    try {
      let audioPath = null;
      if (audio) {
        const sign = await api('/api/announcements', { method: 'POST', body: JSON.stringify({ step: 'sign', audio: { type: audio.type, size: audio.size } }) });
        const { error } = await supabase.storage.from('stories').uploadToSignedUrl(sign.path, sign.token, audio, { contentType: audio.type });
        if (error) throw new Error('Gagal mengunggah VN. Coba lagi.');
        audioPath = sign.path;
      }
      await api('/api/announcements', { method: 'POST', body: JSON.stringify({ step: 'create', text: text.trim(), audioPath }) });
      setText(''); setAudio(null);
      onMsg({ t: 'Notifikasi terkirim ke panel notifikasi HP pengguna yang sudah mengaktifkannya, dan tampil di dalam aplikasi untuk yang sedang membuka.' });
      await load();
    } catch (e) { onMsg({ err: true, t: e.message }); }
    setBusy('');
  };

  const remove = async (a) => {
    if (!window.confirm('Hapus notifikasi ini?')) return;
    try { await api(`/api/announcements?id=${a.id}`, { method: 'DELETE' }); await load(); } catch (e) { onMsg({ err: true, t: e.message }); }
  };

  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <section className="card fade">
      <h2>Notifikasi</h2>
      <p className="hint">Teks atau pesan suara (VN) yang muncul di atas layar semua pengguna selama beberapa detik. Teks tampil 7 detik. VN tampil sampai selesai diputar.</p>
      <label>Teks (maks. 200 huruf)
        <input type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pengumuman..." disabled={!!busy} />
      </label>
      <div className="acts">
        {!rec
          ? <button type="button" className="chip" onClick={startRec} disabled={!!busy}>Rekam VN</button>
          : <button type="button" className="chip danger" onClick={stopRec}>Berhenti ({clock})</button>}
        <label className="chip" style={{ cursor: 'pointer' }}>
          Unggah audio
          <input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav" onChange={pickFile} disabled={!!busy || rec} style={{ display: 'none' }} />
        </label>
      </div>
      {rec && <p className="muted" role="status">Merekam&hellip; maksimal 60 detik.</p>}
      {audio && !rec && (
        <>
          <audio src={audioSrc} controls style={{ width: '100%' }} />
          <button type="button" className="chip" onClick={() => setAudio(null)} disabled={!!busy}>Buang VN</button>
        </>
      )}
      <button type="button" className="btn" onClick={send} disabled={!!busy || rec || (!text.trim() && !audio)}>{busy || 'Kirim notifikasi'}</button>

      <h3>Riwayat</h3>
      <ul className="list">
        {(list || []).map((a) => (
          <li key={a.id}>
            <span className="grow">
              <b>{a.text || 'Pesan suara'}</b>
              <small className="muted">{a.kind === 'voice' ? 'VN' : 'Teks'} &middot; {ago(a.createdAt)}</small>
            </span>
            <span className="acts"><button className="chip danger" onClick={() => remove(a)}>Hapus</button></span>
          </li>
        ))}
        {list && list.length === 0 && <li className="empty">Belum ada notifikasi.</li>}
        {!list && <li className="empty">Memuat&hellip;</li>}
      </ul>
    </section>
  );
}

function Panel() {
  const [tab, setTab] = useState('pengguna');
  const [tpls, setTpls] = useState([]);
  const [tgts, setTgts] = useState([]);
  const emptyT = { title: '', subject: '', body: '' };
  const emptyG = { label: '', email: '', active: true };
  const [tf, setTf] = useState(emptyT);
  const [gf, setGf] = useState(emptyG);
  const [editT, setEditT] = useState(null);
  const [editG, setEditG] = useState(null);
  const [msg, setMsg] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [formT, setFormT] = useState(false);
  const [formG, setFormG] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([api('/api/admin/templates'), api('/api/admin/targets'), api('/api/admin/settings')]);
    setTpls(a.items); setTgts(b.items); setDailyLimit(c.dailyUserLimit);
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ err: true, t: e.message })); }, [load]);

  const run = async (fn, ok) => {
    setMsg(null);
    try { await fn(); setMsg({ t: ok }); await load(); } catch (e) { setMsg({ err: true, t: e.message }); }
  };
  const save = (path, form, id, reset, setEdit) => run(async () => {
    await api(path, { method: id ? 'PUT' : 'POST', body: JSON.stringify(id ? { ...form, id } : form) });
    reset(); setEdit(null);
  }, 'Tersimpan.');

  return (
    <>
      {msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>}

      <div className="seg" role="tablist" aria-label="Bagian admin">
        {[['pengguna', 'Pengguna'], ['gmail', 'Gmail'], ['notif', 'Notif'], ['centang', 'Centang'], ['kuota', 'Kuota'], ['teks', 'Teks'], ['tujuan', 'Tujuan']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(null); }}>{l}</button>
        ))}
      </div>

      {tab === 'pengguna' && <Users onMsg={setMsg} />}
      {tab === 'gmail' && <Gmails onMsg={setMsg} />}
      {tab === 'notif' && <Notif onMsg={setMsg} />}
      {tab === 'centang' && <AdminVerify onMsg={setMsg} />}

      {tab === 'kuota' && <section className="card fade">
        <h2>Kuota pengiriman</h2>
        <p className="muted">Atur batas pengiriman harian untuk setiap pengguna (1&ndash;100). Batas per pengirim global tetap diterapkan untuk menjaga pemakaian yang wajar.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ dailyUserLimit: Number(dailyLimit) }) }), 'Kuota harian diperbarui.'); }}>
          <label>Pengiriman per pengguna per hari<input type="number" min="1" max="100" required value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} /></label>
          <button className="btn small">Simpan kuota</button>
        </form>
      </section>}

      {tab === 'teks' && <section className="card fade">
        <h2>Teks permohonan</h2>
        <p className="muted">Tulis lebih dari satu teks. Gunakan {'{nomor}'} untuk nomor user. Pengguna memilih salah satu saat mengirim.</p>
        <ul className="list">
          {tpls.map((t) => (
            <li key={t.id}><span className="grow"><b>{t.title}</b><small className="muted">{t.subject}</small></span>
              <span className="acts">
                <button className="chip" onClick={() => { setEditT(t.id); setTf({ title: t.title, subject: t.subject, body: t.body }); }}>Ubah</button>
                <button className="chip danger" onClick={() => run(() => api(`/api/admin/templates?id=${t.id}`, { method: 'DELETE' }), 'Terhapus.')}>Hapus</button>
              </span></li>
          ))}
          {tpls.length === 0 && <li className="empty">Belum ada teks.</li>}
        </ul>
        {!formT && !editT && <button className="btn small" onClick={() => setFormT(true)}>+ Tambah teks</button>}
        {(formT || editT) && <form onSubmit={(e) => { e.preventDefault(); save('/api/admin/templates', tf, editT, () => { setTf(emptyT); setFormT(false); }, setEditT); }}>
          <label>Judul<input required value={tf.title} onChange={(e) => setTf({ ...tf, title: e.target.value })} /></label>
          <label>Subjek email<input required value={tf.subject} onChange={(e) => setTf({ ...tf, subject: e.target.value })} /></label>
          <label>Isi<textarea required rows={6} value={tf.body} onChange={(e) => setTf({ ...tf, body: e.target.value })} /></label>
          <button className="btn small">{editT ? 'Simpan perubahan' : 'Tambah teks'}</button>
          <button type="button" className="chip" onClick={() => { setEditT(null); setTf(emptyT); setFormT(false); }}>Batal</button>
        </form>}
      </section>}

      {tab === 'tujuan' && <section className="card fade">
        <h2>Email tujuan</h2>
        <p className="muted">Alamat resmi yang menerima permohonan. User memilih salah satu; yang nonaktif tidak muncul.</p>
        <ul className="list">
          {tgts.map((g) => (
            <li key={g.id}><span className="grow"><b>{g.label}</b><small className="muted">{g.email}{g.active ? '' : ' (nonaktif)'}</small></span>
              <span className="acts">
                <button className="chip" onClick={() => { setEditG(g.id); setGf({ label: g.label, email: g.email, active: g.active }); }}>Ubah</button>
                <button className="chip danger" onClick={() => run(() => api(`/api/admin/targets?id=${g.id}`, { method: 'DELETE' }), 'Terhapus.')}>Hapus</button>
              </span></li>
          ))}
          {tgts.length === 0 && <li className="empty">Belum ada tujuan.</li>}
        </ul>
        {!formG && !editG && <button className="btn small" onClick={() => setFormG(true)}>+ Tambah tujuan</button>}
        {(formG || editG) && <form onSubmit={(e) => { e.preventDefault(); save('/api/admin/targets', gf, editG, () => { setGf(emptyG); setFormG(false); }, setEditG); }}>
          <label>Nama<input required value={gf.label} onChange={(e) => setGf({ ...gf, label: e.target.value })} /></label>
          <label>Email tujuan<input type="email" required value={gf.email} onChange={(e) => setGf({ ...gf, email: e.target.value })} /></label>
          <label className="inline"><input type="checkbox" checked={gf.active} onChange={(e) => setGf({ ...gf, active: e.target.checked })} /> Aktif</label>
          <button className="btn small">{editG ? 'Simpan perubahan' : 'Tambah tujuan'}</button>
          <button type="button" className="chip" onClick={() => { setEditG(null); setGf(emptyG); setFormG(false); }}>Batal</button>
        </form>}
      </section>}
    </>
  );
}

export default function Admin() {
  return <Shell adminOnly active="admin">{() => <Panel />}</Shell>;
}
