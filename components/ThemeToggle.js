'use client';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('glass');
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'glass'); }, []);
  const flip = () => {
    const next = theme === 'glass' ? 'comic' : 'glass';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fm-theme', next); } catch (e) {}
    setTheme(next);
  };
  return (
    <button type="button" className="chip" onClick={flip} aria-label="Ganti tampilan">
      {theme === 'glass' ? 'Tampilan komik 3D' : 'Tampilan liquid glass'}
    </button>
  );
}
