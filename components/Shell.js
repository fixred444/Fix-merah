'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, api } from '@/lib/client';
import ThemeToggle from './ThemeToggle';
import Announcer from './Announcer';

export default function Shell({ children, adminOnly = false, active }) {
  const r = useRouter();
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return r.replace('/masuk');
      try {
        const m = await api('/api/me');
        if (adminOnly && !m.isAdmin) return r.replace('/menu');
        setMe(m);
      } catch { r.replace('/masuk'); }
    })();
  }, [r, adminOnly]);

  if (!me) return <main className="center"><p className="muted">Memuat&hellip;</p></main>;
  if (me.status === 'nonaktif') {
    return (
      <main className="center">
        <section className="card auth">
          <h2>Akun dinonaktifkan</h2>
          <p className="muted">Akunmu dinonaktifkan oleh admin{me.note ? `: ${me.note}` : '.'} Hubungi admin kalau ini keliru.</p>
          <button className="btn" onClick={async () => { await supabase.auth.signOut(); r.replace('/masuk'); }}>Keluar</button>
        </section>
      </main>
    );
  }
  return (
    <div className="wrap">
      <Announcer />
      <header className="top card">
        <div className="brand"><span className="logo">FM</span><span className="brandname">Fix Merah</span></div>
        <nav>
          <Link href="/menu" className={active === 'menu' ? 'nav on' : 'nav'}>Menu utama</Link>
          {me.isAdmin && <Link href="/admin" className={active === 'admin' ? 'nav on' : 'nav'}>Admin</Link>}
        </nav>
        <div className="right-tools">
          <ThemeToggle />
          <button className="chip" onClick={async () => { await supabase.auth.signOut(); r.replace('/masuk'); }}>Keluar</button>
        </div>
      </header>
      <div className="content">
        {me.status === 'beku' && <p className="note err" role="status">Akunmu sedang dibekukan admin{me.note ? `: ${me.note}` : '.'} Kamu masih bisa melihat data, tapi belum bisa mengirim.</p>}
        {children(me)}
      </div>
    </div>
  );
}
