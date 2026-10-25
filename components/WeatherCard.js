'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT = { lat: -6.2088, lon: 106.8456, place: 'Jakarta' };
const TTL = 20 * 60e3;

// Kode cuaca Open-Meteo (WMO) -> teks Indonesia + ikon.
function describe(code) {
  if (code === 0) return ['Cerah', '☀️'];
  if (code === 1) return ['Cerah berawan', '\u{1F324}️'];
  if (code === 2) return ['Berawan sebagian', '⛅'];
  if (code === 3) return ['Berawan', '☁️'];
  if (code === 45 || code === 48) return ['Berkabut', '\u{1F32B}️'];
  if (code >= 51 && code <= 57) return ['Gerimis', '\u{1F326}️'];
  if (code >= 61 && code <= 67) return ['Hujan', '\u{1F327}️'];
  if (code >= 71 && code <= 77) return ['Salju', '❄️'];
  if (code >= 80 && code <= 82) return ['Hujan deras', '\u{1F327}️'];
  if (code >= 95) return ['Badai petir', '⛈️'];
  return ['Cuaca', '\u{1F321}️'];
}

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('bad');
    return await res.json();
  } finally { clearTimeout(t); }
}

export default function WeatherCard() {
  const [wx, setWx] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const pos = useRef(DEFAULT);

  const fetchWx = useCallback(async (force) => {
    setBusy(true); setErr('');
    try {
      if (!force) {
        const c = JSON.parse(localStorage.getItem('fm_wx') || 'null');
        if (c && Date.now() - c.at < TTL && c.lat === pos.current.lat && c.lon === pos.current.lon) { setWx(c); setBusy(false); return; }
      }
      const { lat, lon, place } = pos.current;
      const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`);
      const c = d.current;
      const out = { lat, lon, place, temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), hum: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m), code: c.weather_code, at: Date.now() };
      setWx(out);
      try { localStorage.setItem('fm_wx', JSON.stringify(out)); } catch {}
    } catch { setErr('Cuaca belum bisa dimuat. Periksa koneksi lalu tekan Refresh.'); }
    setBusy(false);
  }, []);

  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem('fm_wx_pos') || 'null'); if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) pos.current = p; } catch {}
    fetchWx(false);
  }, [fetchWx]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setErr('Perangkat ini tidak mendukung lokasi.'); return; }
    setBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(async (g) => {
      const lat = Math.round(g.coords.latitude * 1000) / 1000; const lon = Math.round(g.coords.longitude * 1000) / 1000;
      let place = 'Lokasimu';
      try {
        const r = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`);
        place = r.locality || r.city || r.principalSubdivision || place;
      } catch {}
      pos.current = { lat, lon, place };
      try { localStorage.setItem('fm_wx_pos', JSON.stringify(pos.current)); } catch {}
      fetchWx(true);
    }, () => { setBusy(false); setErr('Izin lokasi ditolak. Aktifkan lokasi di pengaturan browser.'); }, { timeout: 10000, maximumAge: 600000 });
  };

  const [label, icon] = wx ? describe(wx.code) : ['Memuat…', '\u{1F321}️'];
  return (
    <section className="card wx fade" aria-label="Cuaca">
      <div className="wxtop">
        <span className="wxicon" aria-hidden="true">{icon}</span>
        <div className="wxmid">
          <button type="button" className="wxplace" onClick={useMyLocation} aria-label="Gunakan lokasiku">{'\u{1F4CD}'} {wx ? wx.place : DEFAULT.place}</button>
          <b className="wxlabel">{label}</b>
        </div>
        <div className="wxtemp">
          <b>{wx ? `${wx.temp}°` : '--'}<small>C</small></b>
          <small className="muted">{wx ? `Terasa ${wx.feels}°` : ''}</small>
        </div>
      </div>
      <div className="wxrow">
        <div><span aria-hidden="true">{'\u{1F4A7}'}</span><b>{wx ? `${wx.hum}%` : '--'}</b><small>Kelembapan</small></div>
        <div><span aria-hidden="true">{'\u{1F32C}️'}</span><b>{wx ? `${wx.wind} km/j` : '--'}</b><small>Kecepatan angin</small></div>
        <button type="button" onClick={() => fetchWx(true)} disabled={busy} aria-label="Muat ulang cuaca"><span aria-hidden="true" className={busy ? 'spin' : ''}>{'↻'}</span><b>Refresh</b><small>{busy ? 'Memuat' : 'Perbarui'}</small></button>
      </div>
      {err && <small className="note err" role="status">{err}</small>}
    </section>
  );
}
