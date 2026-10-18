'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';

function Panel() {
  const [tab, setTab] = useState('kuota');
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
        {[['kuota', 'Kuota'], ['teks', 'Teks'], ['tujuan', 'Tujuan']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(null); }}>{l}</button>
        ))}
      </div>

      {tab === 'kuota' && <section className="card fade">
        <h2>Kuota pengiriman</h2>
        <p className="muted">Atur batas pengiriman harian untuk setiap pengguna (1–100). Batas per pengirim global tetap diterapkan untuk menjaga pemakaian yang wajar.</p>
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
