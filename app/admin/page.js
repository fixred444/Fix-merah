'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import Shell from '@/components/Shell';

function Panel() {
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

      <section className="card">
        <h2>Kuota pengiriman</h2>
        <p className="muted">Atur batas pengiriman harian untuk setiap pengguna (1–100). Batas per pengirim global tetap diterapkan untuk menjaga pemakaian yang wajar.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ dailyUserLimit: Number(dailyLimit) }) }), 'Kuota harian diperbarui.'); }}>
          <label>Pengiriman per pengguna per hari<input type="number" min="1" max="100" required value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} /></label>
          <button className="btn small">Simpan kuota</button>
        </form>
      </section>

      <section className="card">
        <h2>Teks permohonan</h2>
        <p className="muted">Tulis lebih dari satu teks. Gunakan {'{nomor}'} untuk nomor user. Pengguna memilih salah satu saat mengirim.</p>
        <ul className="list">
          {tpls.map((t) => (
            <li key={t.id}><span><b>{t.title}</b><br /><small className="muted">{t.subject}</small></span>
              <span>
                <button className="link" onClick={() => { setEditT(t.id); setTf({ title: t.title, subject: t.subject, body: t.body }); }}>Ubah</button>{' '}
                <button className="link danger" onClick={() => run(() => api(`/api/admin/templates?id=${t.id}`, { method: 'DELETE' }), 'Terhapus.')}>Hapus</button>
              </span></li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); save('/api/admin/templates', tf, editT, () => setTf(emptyT), setEditT); }}>
          <label>Judul<input required value={tf.title} onChange={(e) => setTf({ ...tf, title: e.target.value })} /></label>
          <label>Subjek email<input required value={tf.subject} onChange={(e) => setTf({ ...tf, subject: e.target.value })} /></label>
          <label>Isi<textarea required rows={6} value={tf.body} onChange={(e) => setTf({ ...tf, body: e.target.value })} /></label>
          <button className="btn small">{editT ? 'Simpan perubahan' : 'Tambah teks'}</button>
          {editT && <button type="button" className="link" onClick={() => { setEditT(null); setTf(emptyT); }}>Batal</button>}
        </form>
      </section>

      <section className="card">
        <h2>Email tujuan</h2>
        <p className="muted">Alamat resmi yang menerima permohonan. User memilih salah satu; yang nonaktif tidak muncul.</p>
        <ul className="list">
          {tgts.map((g) => (
            <li key={g.id}><span><b>{g.label}</b><br /><small className="muted">{g.email}{g.active ? '' : ' (nonaktif)'}</small></span>
              <span>
                <button className="link" onClick={() => { setEditG(g.id); setGf({ label: g.label, email: g.email, active: g.active }); }}>Ubah</button>{' '}
                <button className="link danger" onClick={() => run(() => api(`/api/admin/targets?id=${g.id}`, { method: 'DELETE' }), 'Terhapus.')}>Hapus</button>
              </span></li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); save('/api/admin/targets', gf, editG, () => setGf(emptyG), setEditG); }}>
          <label>Nama<input required value={gf.label} onChange={(e) => setGf({ ...gf, label: e.target.value })} /></label>
          <label>Email tujuan<input type="email" required value={gf.email} onChange={(e) => setGf({ ...gf, email: e.target.value })} /></label>
          <label className="inline"><input type="checkbox" checked={gf.active} onChange={(e) => setGf({ ...gf, active: e.target.checked })} /> Aktif</label>
          <button className="btn small">{editG ? 'Simpan perubahan' : 'Tambah tujuan'}</button>
          {editG && <button type="button" className="link" onClick={() => { setEditG(null); setGf(emptyG); }}>Batal</button>}
        </form>
      </section>
    </>
  );
}

export default function Admin() {
  return <Shell adminOnly active="admin">{() => <Panel />}</Shell>;
}
