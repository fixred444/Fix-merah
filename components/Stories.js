'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, supabase } from '@/lib/client';

const BUCKET = 'stories';
const IMAGE_MS = 7000;
const MB = 1048576;
const AUDIO_BY_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' };
const AUDIO_OK = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'];

function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
}

// Kecilkan foto supaya cepat terunggah (foto kamera bisa 5-10 MB).
async function shrinkImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'story.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

async function putFile(slot, file) {
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
  if (error) throw new Error('Gagal mengunggah file. Coba lagi.');
}

function Portal({ children }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok ? createPortal(children, document.body) : null;
}

const overlay = { position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflowY: 'auto' };

function Composer({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [music, setMusic] = useState(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const musicSrc = useMemo(() => (music ? URL.createObjectURL(music) : ''), [music]);
  useEffect(() => () => { if (musicSrc) URL.revokeObjectURL(musicSrc); }, [musicSrc]);

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0]; setErr('');
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) { setErr('Pilih foto atau video.'); return; }
    setFile(f);
  };
  const pickMusic = (e) => {
    const f = e.target.files && e.target.files[0]; setErr('');
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const type = AUDIO_OK.includes(f.type) ? f.type : AUDIO_BY_EXT[ext];
    if (!type) { setErr('Format musik tidak didukung. Pakai MP3, M4A, AAC, OGG, atau WAV.'); return; }
    if (f.size > 10 * MB) { setErr('Musik maksimal 10 MB.'); return; }
    setMusic(new File([f], f.name, { type }));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 60));
  };

  const submit = async () => {
    if (!file) { setErr('Pilih foto atau video dulu.'); return; }
    setErr('');
    try {
      setBusy('Menyiapkan...');
      const media = await shrinkImage(file);
      const isVideo = media.type.startsWith('video/');
      if (media.size > (isVideo ? 25 : 6) * MB) throw new Error(isVideo ? 'Video maksimal 25 MB.' : 'Foto terlalu besar.');
      const sign = await api('/api/stories', { method: 'POST', body: JSON.stringify({ step: 'sign', media: { type: media.type, size: media.size }, music: music ? { type: music.type, size: music.size } : null }) });
      setBusy('Mengunggah media...');
      await putFile(sign.media, media);
      if (music) { setBusy('Mengunggah musik...'); await putFile(sign.music, music); }
      setBusy('Memposting...');
      await api('/api/stories', { method: 'POST', body: JSON.stringify({ step: 'create', mediaPath: sign.media.path, mediaType: isVideo ? 'video' : 'image', musicPath: music ? sign.music.path : null, musicTitle: music ? title.trim() : '', caption: caption.trim() }) });
      onDone();
    } catch (e) { setErr(e.message || 'Gagal memposting story.'); setBusy(''); }
  };

  return (
    <Portal>
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Buat story">
      <section className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h2>Buat story</h2>
        <label>Foto atau video
          <input type="file" accept="image/*,video/*" onChange={pickFile} disabled={!!busy} />
        </label>
        {preview && (file.type.startsWith('video/')
          ? <video src={preview} controls playsInline muted style={{ width: '100%', maxHeight: 260, marginTop: 8, borderRadius: 12, background: '#000' }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={preview} alt="Pratinjau story" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', marginTop: 8, borderRadius: 12, background: '#000' }} />)}
        <label>Teks (opsional)
          <input type="text" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Tulis sesuatu..." disabled={!!busy} />
        </label>
        <label>Musik (opsional)
          <input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav" onChange={pickMusic} disabled={!!busy} />
        </label>
        {music && (
          <>
            <label>Judul lagu
              <input type="text" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!busy} />
            </label>
            <audio src={musicSrc} controls style={{ width: '100%' }} />
            <button type="button" className="chip" onClick={() => { setMusic(null); setTitle(''); }} disabled={!!busy}>Lepas musik</button>
          </>
        )}
        <p className="muted">Pakai musik milikmu atau yang bebas hak cipta. Story hilang otomatis setelah 24 jam.</p>
        {err && <p className="note err" role="alert">{err}</p>}
        <div className="acts">
          <button type="button" className="btn" onClick={submit} disabled={!!busy || !file}>{busy || 'Posting story'}</button>
          <button type="button" className="chip" onClick={onClose} disabled={!!busy}>Batal</button>
        </div>
      </section>
    </div>
    </Portal>
  );
}

function Viewer({ groups, start, onClose, onDelete }) {
  const [g, setG] = useState(start);
  const [i, setI] = useState(0);
  const [pct, setPct] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef(null);
  const group = groups[g];
  const story = group.items[i];

  const next = useCallback(() => {
    setPct(0);
    if (i < group.items.length - 1) setI(i + 1);
    else if (g < groups.length - 1) { setG(g + 1); setI(0); }
    else onClose();
  }, [i, g, group, groups.length, onClose]);
  const prev = useCallback(() => {
    setPct(0);
    if (i > 0) setI(i - 1);
    else if (g > 0) { setG(g - 1); setI(0); }
  }, [i, g]);

  // Foto: maju otomatis setelah 7 detik. Video: maju saat selesai.
  useEffect(() => {
    if (story.mediaType !== 'image') return undefined;
    const t0 = Date.now();
    const t = setInterval(() => {
      const p = (Date.now() - t0) / IMAGE_MS;
      if (p >= 1) { clearInterval(t); next(); } else setPct(p * 100);
    }, 80);
    return () => clearInterval(t);
  }, [story.id, story.mediaType, next]);

  // Musik diputar saat story tampil (dibuka lewat ketukan, jadi diizinkan browser).
  useEffect(() => {
    setBlocked(false);
    const a = audioRef.current;
    if (!a) return;
    const p = a.play();
    if (p && p.catch) p.catch(() => setBlocked(true));
  }, [story.id]);

  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', key); };
  }, [onClose, next, prev]);

  const zone = { position: 'absolute', top: 0, bottom: 0, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' };
  return (
    <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }} role="dialog" aria-modal="true" aria-label={`Story ${group.author}`}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 10px 6px' }}>
        {group.items.map((s, k) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#fff', width: `${k < i ? 100 : k === i ? pct : 0}%` }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 8px' }}>
        <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.mine ? 'Kamu' : group.author} <small style={{ opacity: 0.7, fontWeight: 400 }}>{ago(story.createdAt)}</small></b>
        {story.canDelete && <button type="button" className="chip" onClick={() => onDelete(story)}>Hapus</button>}
        <button type="button" className="chip" onClick={onClose} aria-label="Tutup story">&times;</button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {story.mediaType === 'video'
          ? <video key={story.id} src={story.mediaUrl} autoPlay playsInline muted={!!story.musicUrl} onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setPct((v.currentTime / v.duration) * 100); }} onEnded={next} onError={next} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img key={story.id} src={story.mediaUrl} alt={story.caption || 'Story'} onError={next} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
        <button type="button" aria-label="Story sebelumnya" onClick={prev} style={{ ...zone, left: 0, width: '35%' }} />
        <button type="button" aria-label="Story berikutnya" onClick={next} style={{ ...zone, right: 0, width: '65%' }} />
      </div>
      {story.musicUrl && <audio key={story.id} ref={audioRef} src={story.musicUrl} loop preload="auto" />}
      <div style={{ padding: '10px 14px 18px', minHeight: 56 }}>
        {story.caption && <p style={{ margin: '0 0 6px' }}>{story.caption}</p>}
        {story.musicUrl && (
          <small style={{ opacity: 0.85 }}>
            &#9834; {story.musicTitle || 'Musik'}
            {blocked && <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={() => { const a = audioRef.current; if (a) a.play().then(() => setBlocked(false)).catch(() => {}); }}>Putar musik</button>}
          </small>
        )}
      </div>
    </div>
    </Portal>
  );
}

export default function Stories() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [composer, setComposer] = useState(false);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    try { const r = await api('/api/stories'); setItems(r.items || []); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const s of items) {
      if (!m.has(s.userId)) m.set(s.userId, { userId: s.userId, author: s.author, mine: s.mine, items: [] });
      m.get(s.userId).items.push(s);
    }
    const arr = [...m.values()];
    const last = (x) => x.items[x.items.length - 1].createdAt;
    arr.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || String(last(b)).localeCompare(String(last(a))));
    return arr;
  }, [items]);

  const remove = async (s) => {
    if (!window.confirm('Hapus story ini?')) return;
    try { await api(`/api/stories?id=${s.id}`, { method: 'DELETE' }); setViewer(null); await load(); } catch (e) { setErr(e.message); }
  };

  const circle = { width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: '#fff', background: '#555', flex: '0 0 auto' };
  return (
    <section className="card fade" aria-label="Story">
      <b>Story</b>
      {err && <p className="note err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '10px 2px 4px' }}>
        <button type="button" onClick={() => setComposer(true)} aria-label="Tambah story" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'center', cursor: 'pointer', flex: '0 0 auto' }}>
          <span style={{ ...circle, border: '3px dashed currentColor', background: 'transparent', color: 'inherit', fontSize: 30 }}>+</span>
          <small style={{ display: 'block', marginTop: 4 }}>Tambah</small>
        </button>
        {groups.map((gr, idx) => (
          <button key={gr.userId} type="button" onClick={() => setViewer(idx)} aria-label={`Lihat story ${gr.mine ? 'kamu' : gr.author}`} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'center', cursor: 'pointer', flex: '0 0 auto', maxWidth: 70 }}>
            <span style={{ ...circle, border: '3px solid #e63946' }}>{(gr.author || '?').charAt(0).toUpperCase()}</span>
            <small style={{ display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gr.mine ? 'Kamu' : gr.author}</small>
          </button>
        ))}
        {!groups.length && !err && <small className="muted" style={{ alignSelf: 'center' }}>Belum ada story. Jadilah yang pertama!</small>}
      </div>
      {composer && <Composer onClose={() => setComposer(false)} onDone={() => { setComposer(false); load(); }} />}
      {viewer !== null && groups[viewer] && <Viewer groups={groups} start={viewer} onClose={() => setViewer(null)} onDelete={remove} />}
    </section>
  );
    }
