import { Figtree, Bangers } from 'next/font/google';
import './globals.css';

const body = Figtree({ subsets: ['latin'], variable: '--font-body' });
const comic = Bangers({ subsets: ['latin'], weight: '400', variable: '--font-comic' });

const SITE = 'https://fixmerahapelxz7.vercel.app';
const DEV = 'Rapael Christian Sitanggang';

export const metadata = {
  metadataBase: new URL(SITE),
  title: 'Fix Merah - Pemulihan Login WhatsApp, Chat & Telepon',
  description:
    'Fix Merah: kirim permohonan peninjauan nomor WhatsApp lewat Gmail-mu untuk atasi "Login tidak tersedia". Ada chat pribadi, chat global, dan telepon.',
  keywords: [
    'Fix Merah',
    'login tidak tersedia WhatsApp',
    'pemulihan login WhatsApp',
    'chat pribadi',
    'chat global',
    'telepon online',
  ],
  authors: [{ name: DEV }],
  creator: DEV,
  publisher: DEV,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  openGraph: {
    title: 'Fix Merah - Pemulihan Login WhatsApp, Chat & Telepon',
    description: 'Bantu atasi login WhatsApp tidak tersedia. Chat pribadi, chat global, dan telepon.',
    url: SITE,
    siteName: 'Fix Merah',
    type: 'website',
  },
};
export const viewport = { themeColor: '#e63946' };

const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('fm-theme')||'glass'}catch(e){document.documentElement.dataset.theme='glass'}`;

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Fix Merah',
  url: SITE,
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'Web',
  featureList: ['Pemulihan login WhatsApp', 'Chat pribadi', 'Chat global', 'Telepon'],
  author: { '@type': 'Person', name: DEV },
});

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="glass" className={`${body.variable} ${comic.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        <div className="bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
    }
