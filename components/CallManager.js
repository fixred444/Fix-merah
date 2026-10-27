'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, supabase } from '@/lib/client';
import Avatar from './Avatar';
import Verified from './Verified';

const POLL_IDLE = 2500;
const POLL_CALL = 1000;
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Nada sederhana lewat WebAudio (tanpa file suara).
function makeTone() {
  let ctx = null; let timer = null;
  const beep = (f, d) => {
    try {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; g.gain.value = 0.07; o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + d);
    } catch {}
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const start = (kind) => {
    stop();
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.resume) ctx.resume(); } catch { return; }
    const one = kind === 'ring' ? () => { beep(880, 0.35); setTimeout(() => beep(660, 0.35), 420); } : () => beep(425, 1.0);
    one(); timer = setInterval(one, kind === 'ring' ? 2400 : 4000);
  };
  return { start, stop };
}

// Panggilan suara (WebRTC). Sinyal lewat /api/call; suara langsung antar perangkat.
export default function CallManager() {
  const [phase, setPhase] = useState('idle'); // idle | out | in | conn | live
  const [peer, setPeer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [note, setNote] = useState('');
  const [mounted, setMounted] = useState(false);

  const phaseRef = useRef('idle');
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const idRef = useRef(null);
  const afterRef = useRef(0);
  const queueRef = useRef([]);
  const offerRef = useRef(null);
  const audioRef = useRef(null);
  const tokenRef = useRef('');
  const toneRef = useRef(null);
  const busyPoll = useRef(false);
  const timers = useRef({ poll: null, clock: null, note: null });
  const isCaller = useRef(false);
  const answerSet = useRef(false);
  const liveAt = useRef(0);

  useEffect(() => { setMounted(true); toneRef.current = makeTone(); }, []);
  const setPh = (p) => { phaseRef.current = p; setPhase(p); };
  const flash = (t) => { setNote(t); clearTimeout(timers.current.note); timers.current.note = setTimeout(() => setNote(''), 4000); };

  const cleanup = useCallback((msg) => {
    clearInterval(timers.current.poll); clearInterval(timers.current.clock);
    timers.current.poll = null; timers.current.clock = null;
    if (toneRef.current) toneRef.current.stop();
    try { if (navigator.vibrate) navigator.vibrate(0); } catch {}
    if (pcRef.current) { try { pcRef.current.onicecandidate = null; pcRef.current.ontrack = null; pcRef.current.onconnectionstatechange = null; pcRef.current.close(); } catch {} }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    pcRef.current = null; streamRef.current = null; idRef.current = null; afterRef.current = 0; queueRef.current = []; offerRef.current = null; answerSet.current = false; liveAt.current = 0;
    setMuted(false); setSecs(0); setPeer(null); setPh('idle');
    if (msg) flash(msg);
  }, []);

  const sendIce = (c) => { api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'ice', id: idRef.current, candidate: c }) }).catch(() => {}); };

  const markLive = useCallback(() => {
    if (phaseRef.current === 'live' || phaseRef.current === 'idle') return;
    setPh('live'); liveAt.current = Date.now(); setSecs(0);
    if (toneRef.current) toneRef.current.stop();
    clearInterval(timers.current.clock);
    timers.current.clock = setInterval(() => setSecs(Math.round((Date.now() - liveAt.current) / 1000)), 1000);
  }, []);

  const hangup = useCallback((msg) => {
    const id = idRef.current;
    if (id) api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'end', id }) }).catch(() => {});
    cleanup(msg || 'Panggilan berakhir');
  }, [cleanup]);

  const makePc = useCallback(async () => {
    const { iceServers } = await api('/api/call?ice=1');
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = e.candidate.toJSON();
      if (idRef.current) sendIce(c); else queueRef.current.push(c);
    };
    pc.ontrack = (e) => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play().catch(() => {}); } };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      if (pc.connectionState === 'connected') markLive();
      if (pc.connectionState === 'failed') hangup('Koneksi gagal. Jaringan mungkin memblokir panggilan suara.');
    };
    return pc;
  }, [hangup, markLive]);

  const getMic = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current = s;
    return s;
  };

  const flushQueue = () => { queueRef.current.splice(0).forEach(sendIce); };

  // Polling status panggilan yang sedang berjalan (suara dering, jawaban, kandidat ICE, selesai).
  const pollCall = useCallback(async () => {
    const id = idRef.current;
    if (!id || busyPoll.current) return;
    busyPoll.current = true;
    try {
      const r = await api(`/api/call?id=${id}&after=${afterRef.current}`);
      if (idRef.current !== id) return;
      const pc = pcRef.current;
      if (['declined', 'missed', 'canceled', 'ended'].includes(r.status)) {
        const msgs = { declined: 'Panggilan ditolak', missed: isCaller.current ? 'Tidak dijawab' : 'Panggilan tidak terjawab', canceled: 'Panggilan dibatalkan', ended: 'Panggilan berakhir' };
        cleanup(msgs[r.status]); return;
      }
      if (pc && isCaller.current && r.answer && !answerSet.current) {
        answerSet.current = true;
        await pc.setRemoteDescription(r.answer);
        if (toneRef.current) toneRef.current.stop();
        setPh('conn');
      }
      if (pc && pc.remoteDescription && r.ice?.length) {
        for (const row of r.ice) { try { await pc.addIceCandidate(row.candidate); } catch {} afterRef.current = Math.max(afterRef.current, row.id); }
      }
    } catch { /* coba lagi pada detak berikutnya */ } finally { busyPoll.current = false; }
  }, [cleanup]);

  const startPoll = useCallback(() => {
    clearInterval(timers.current.poll);
    timers.current.poll = setInterval(pollCall, POLL_CALL);
  }, [pollCall]);

  const refreshToken = async () => { try { const { data } = await supabase.auth.getSession(); tokenRef.current = data.session?.access_token || ''; } catch {} };

  const startCall = useCallback(async (to) => {
    if (phaseRef.current !== 'idle' || !to) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) { flash('Perangkat atau browser ini belum mendukung panggilan suara.'); return; }
    isCaller.current = true; answerSet.current = false;
    setPeer({ id: to.id, name: to.name, verified: !!to.verified });
    setPh('out');
    try {
      await refreshToken();
      const stream = await getMic();
      const pc = await makePc(); pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'start', to: to.id, offer: { type: offer.type, sdp: offer.sdp } }) });
      idRef.current = r.id; afterRef.current = 0;
      flushQueue();
      if (toneRef.current) toneRef.current.start('back');
      startPoll();
    } catch (e) {
      cleanup(e && e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Aktifkan mikrofon untuk menelepon.' : (e && e.message) || 'Gagal menelepon');
    }
  }, [cleanup, makePc, startPoll]);

  const answerCall = async () => {
    if (phaseRef.current !== 'in' || !offerRef.current) return;
    const id = idRef.current;
    if (toneRef.current) toneRef.current.stop();
    try { if (navigator.vibrate) navigator.vibrate(0); } catch {}
    setPh('conn');
    try {
      await refreshToken();
      const stream = await getMic();
      const pc = await makePc(); pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(offerRef.current);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'answer', id, answer: { type: ans.type, sdp: ans.sdp } }) });
      flushQueue();
    } catch (e) {
      api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'decline', id }) }).catch(() => {});
      cleanup(e && e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak.' : (e && e.message) || 'Gagal menjawab panggilan');
    }
  };

  const declineCall = () => {
    const id = idRef.current;
    if (id) api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'decline', id }) }).catch(() => {});
    cleanup('');
  };

  const toggleMute = () => {
    const next = !muted;
    if (streamRef.current) streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  // Tombol telepon di chat pribadi mengirim event ini.
  useEffect(() => {
    const h = (e) => startCall(e.detail);
    window.addEventListener('fm-call', h);
    return () => window.removeEventListener('fm-call', h);
  }, [startCall]);

  // Cek panggilan masuk selama tidak sedang menelepon.
  useEffect(() => {
    let dead = false;
    const check = async () => {
      if (dead || document.hidden || phaseRef.current !== 'idle') return;
      try {
        const r = await api('/api/call');
        if (dead || phaseRef.current !== 'idle' || !r.incoming) return;
        isCaller.current = false; answerSet.current = false;
        idRef.current = r.incoming.id; offerRef.current = r.incoming.offer; afterRef.current = 0;
        setPeer(r.incoming.from); setPh('in');
        if (toneRef.current) toneRef.current.start('ring');
        try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch {}
        startPoll();
      } catch { /* diam */ }
    };
    const first = setTimeout(check, 1500);
    const t = setInterval(check, POLL_IDLE);
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearTimeout(first); clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [startPoll]);

  // Pindah halaman / komponen dilepas saat menelepon: akhiri panggilan.
  useEffect(() => () => {
    const id = idRef.current;
    if (id) { api('/api/call', { method: 'POST', body: JSON.stringify({ action: 'end', id }) }).catch(() => {}); }
    clearInterval(timers.current.poll); clearInterval(timers.current.clock);
    if (toneRef.current) toneRef.current.stop();
    if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tutup halaman saat menelepon: akhiri panggilan di server.
  useEffect(() => {
    const bye = () => {
      const id = idRef.current;
      if (!id || !tokenRef.current) return;
      try { fetch('/api/call', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` }, body: JSON.stringify({ action: 'end', id }) }); } catch {}
    };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  if (!mounted) return null;
  const status = { out: 'Memanggil\u2026', in: 'Panggilan suara masuk', conn: 'Menghubungkan\u2026', live: clock(secs) }[phase];
  return createPortal(
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {note && <div className="callnote" role="status">{note}</div>}
      {phase !== 'idle' && peer && (
        <div className="callov" role="dialog" aria-modal="true" aria-label="Panggilan suara">
          <div className="callwho">
            <Avatar name={peer.name} size={112} />
            <b className="callname">{peer.name}{peer.verified && <Verified size={20} />}</b>
            <span className="callstat" aria-live="polite">{status}</span>
          </div>
          <div className="callbtns">
            {phase === 'in' ? (
              <>
                <button type="button" className="cbtn red" onClick={declineCall} aria-label="Tolak panggilan"><span aria-hidden="true">{'\u{1F4F5}'}</span><small>Tolak</small></button>
                <button type="button" className="cbtn green ringing" onClick={answerCall} aria-label="Jawab panggilan"><span aria-hidden="true">{'\u{1F4DE}'}</span><small>Jawab</small></button>
              </>
            ) : (
              <>
                {phase === 'live' && <button type="button" className={muted ? 'cbtn gray on' : 'cbtn gray'} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Nyalakan mikrofon' : 'Matikan mikrofon'}><span aria-hidden="true">{muted ? '\u{1F507}' : '\u{1F3A4}'}</span><small>{muted ? 'Senyap' : 'Mute'}</small></button>}
                <button type="button" className="cbtn red" onClick={() => hangup(phase === 'out' ? 'Panggilan dibatalkan' : 'Panggilan berakhir')} aria-label="Akhiri panggilan"><span aria-hidden="true">{'\u{1F4F5}'}</span><small>{phase === 'out' ? 'Batal' : 'Akhiri'}</small></button>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
