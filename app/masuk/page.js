'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/client';
import ThemeToggle from '@/components/ThemeToggle';

export default function Masuk() {
  const r = useRouter();
  const [mode, setMode] = useState('masuk');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && r.replace('/menu'));
  }, [r]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (pass.length < 8) return setMsg({ err: true, t: 'Kata sandi minimal 8 karakter.' });
    setBusy(true);
    const fn = mode === 'masuk' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password: pass });
    setBusy(false);
    if (error) return setMsg({ err: true, t: error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : error.message });
    if (data.session) r.replace('/menu');
    else setMsg({ t: 'Akun dibuat. Cek email untuk konfirmasi, lalu masuk.' });
  }

  async function lupa() {
    if (!email) return setMsg({ err: true, t: 'Isi email dulu, lalu tekan Lupa kata sandi.' });
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setMsg(error ? { err: true, t: error.message } : { t: 'Tautan reset dikirim ke emailmu.' });
  }

  return (
    <main className="center">
      <div className="topbar"><ThemeToggle /></div>
      <section className="card auth">
        <div className="brand"><span className="logo">FM</span><span className="brandname">Fix Merah</span></div>
        <div className="tabs" role="tablist">
          {['masuk', 'daftar'].map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'tab on' : 'tab'}
              onClick={() => { setMode(m); setMsg(null); }}>{m === 'masuk' ? 'Masuk' : 'Daftar'}</button>
          ))}
        </div>
        <h1>{mode === 'masuk' ? 'Selamat datang kembali' : 'Buat akun baru'}</h1>
        <p className="muted">{mode === 'masuk' ? 'Masuk dengan email dan kata sandimu.' : 'Daftar gratis dengan email dan kata sandi.'}</p>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" required placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>Kata sandi
            <span className="pw">
              <input type={show ? 'text' : 'password'} required minLength={8} placeholder="Minimal 8 karakter" value={pass}
                onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} />
              <button type="button" className="eye" onClick={() => setShow(!show)}>{show ? 'Sembunyi' : 'Lihat'}</button>
            </span>
          </label>
          {mode === 'masuk' && <button type="button" className="link right" onClick={lupa}>Lupa kata sandi?</button>}
          {msg && <p className={msg.err ? 'note err' : 'note ok'} role="status">{msg.t}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : 'Daftar'}</button>
        </form>
        <p className="muted center-t">
          {mode === 'masuk' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button className="link" onClick={() => { setMode(mode === 'masuk' ? 'daftar' : 'masuk'); setMsg(null); }}>
            {mode === 'masuk' ? 'Daftar gratis' : 'Masuk'}
          </button>
        </p>
      </section>
    </main>
  );
}
