import { Figtree, Bangers } from 'next/font/google';
import './globals.css';

const body = Figtree({ subsets: ['latin'], variable: '--font-body' });
const comic = Bangers({ subsets: ['latin'], weight: '400', variable: '--font-comic' });

export const metadata = {
  title: 'Fix Merah',
  description: 'Kirim permohonan peninjauan nomor WhatsApp lewat Gmail milikmu sendiri.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};
export const viewport = { themeColor: '#e63946' };

const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('fm-theme')||'glass'}catch(e){document.documentElement.dataset.theme='glass'}`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="glass" className={`${body.variable} ${comic.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <div className="bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
