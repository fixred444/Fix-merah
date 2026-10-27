'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, api } from '@/lib/client';
import Avatar from './Avatar';
import Drawer from './Drawer';
import Announcer from './Announcer';
import PushPrompt from './PushPrompt';
import CallManager from './CallManager';

export default function Shell({ children, adminOnly = false, active }) {
  const r = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Lencana pesan pribadi belum dibaca (di ikon surat dan di panel menu).
  useEffect(() => {
    if (!me || me.status === 'nonaktif') return undefined;
    const tick = async () => { if (document.hidden) return; try { const x = await api('/api/dm?unread=1'); setUnread(x.unread || 0); } catch {} };
    tick(); const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [me]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Pindah ke bagian tertentu di halaman menu (dari panel menu / ikon atas).
  const go = (v) => {
    setMenuOpen(false);
    if (pathname === '/menu') window.dispatchEvent(new CustomEvent('fm-nav', { detail: { view: v } }));
    else r.push(v === 'home' ? '/menu' : `/menu?v=${v}`);
  };
  const logout = async () => { await supabase.auth.signOut(); r.replace('/masuk'); };

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
      <CallManager />
      <header className="appbar card">
        <button type="button" className="iconbtn" onClick={() => setMenuOpen(true)} aria-label="Buka menu" aria-haspopup="dialog" aria-expanded={menuOpen}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" /></svg>
        </button>
        <button type="button" className="brand brandbtn" onClick={() => go('home')} aria-label="Ke beranda"><span className="logo">FM</span><span className="brandname">Fix Merah</span></button>
        <span className="grow" />
        <button type="button" className="iconbtn" onClick={() => go('dm')} aria-label={unread > 0 ? `Pesan pribadi, ${unread} belum dibaca` : 'Pesan pribadi'}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z M3.5 7l8.5 6.5L20.5 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none" /></svg>
          {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
        </button>
        <button type="button" className="iconbtn avatarbtn" onClick={() => go('profil')} aria-label="Profil saya"><Avatar name={me.name || me.email} size={32} /></button>
      </header>
      <Drawer open={menuOpen} me={me} unread={unread} onClose={closeMenu} onGo={go} onAdmin={() => { setMenuOpen(false); r.push('/admin'); }} onLogout={logout} />
      <div className="content">
        {me.status === 'beku' && <p className="note err" role="status">Akunmu sedang dibekukan admin{me.note ? `: ${me.note}` : '.'} Kamu masih bisa melihat data, tapi belum bisa mengirim.</p>}
        <PushPrompt />
        {children(me)}
      </div>
    </div>
  );
}
