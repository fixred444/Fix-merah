'use client';
import { useEffect, useRef } from 'react';
import Avatar from './Avatar';
import Verified from './Verified';
import ThemeToggle from './ThemeToggle';

// Panel menu samping (tombol garis tiga). Semua fitur dikumpulkan di sini.
export default function Drawer({ open, me, unread, onClose, onGo, onAdmin, onLogout }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => closeRef.current && closeRef.current.focus(), 50);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; clearTimeout(t); };
  }, [open, onClose]);

  const Item = ({ icon, label, view, badge, onClick }) => (
    <li>
      <button type="button" className="dritem" onClick={onClick || (() => onGo(view))}>
        <span className="dricon" aria-hidden="true">{icon}</span>
        <span className="drlabel">{label}</span>
        {badge > 0 && <span className="badge" style={{ position: 'static' }}>{badge}</span>}
      </button>
    </li>
  );

  return (
    <>
      <div className={open ? 'drback on' : 'drback'} onClick={onClose} aria-hidden="true" />
      <aside className={open ? 'drawer on' : 'drawer'} role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!open} {...(open ? {} : { inert: '' })}>
        <div className="drhead">
          <button type="button" className="drwho" onClick={() => onGo('profil')}>
            <Avatar name={me.name || me.email} size={52} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'flex', alignItems: 'center' }}><span className="drname">{me.name || me.email}</span>{me.verified && <Verified />}</b>
              <small className="muted">{me.isAdmin ? 'Admin' : 'Lihat profil'}</small>
            </span>
          </button>
          <button type="button" ref={closeRef} className="iconbtn" onClick={onClose} aria-label="Tutup menu">&times;</button>
        </div>

        <nav className="drbody" aria-label="Menu utama">
          <ul>
            <Item icon={'\u{1F3E0}'} label="Beranda" view="home" />
            <Item icon={'\u{1F4E8}'} label="Kirim permohonan" view="kirim" />
            <Item icon={'\u{1F511}'} label="Akun Gmail" view="akun" />
            <Item icon={'\u{1F558}'} label="Riwayat" view="riwayat" />
          </ul>
          <p className="drsec">Sosial</p>
          <ul>
            <Item icon={'\u{1F4AC}'} label="Chat global" view="chat" />
            <Item icon={'\u2709\uFE0F'} label="Pesan pribadi" view="dm" badge={unread} />
            <Item icon={'\u{1F465}'} label="Orang" view="orang" />
            <Item icon={'\u2B50'} label="Ulasan" view="ulasan" />
            <Item icon={'\u{1F464}'} label="Profil saya" view="profil" />
          </ul>
          {me.isAdmin && (
            <>
              <p className="drsec">Admin</p>
              <ul><Item icon={'\u{1F6E1}\uFE0F'} label="Panel admin" onClick={onAdmin} /></ul>
            </>
          )}
        </nav>

        <div className="drfoot">
          <ThemeToggle />
          <button type="button" className="chip danger" onClick={onLogout}>Keluar</button>
        </div>
      </aside>
    </>
  );
}
