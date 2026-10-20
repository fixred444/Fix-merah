'use client';
import Avatar from './Avatar';
import Verified from './Verified';

// Satu baris orang: avatar, nama + centang, tombol ikuti.
export default function PersonRow({ p, onOpen, onToggleFollow, busy }) {
  return (
    <li style={{ wordBreak: 'normal' }}>
      <button type="button" onClick={() => onOpen(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0, padding: 0 }}>
        <Avatar name={p.name} size={40} />
        <span style={{ minWidth: 0 }}>
          <b style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>{p.verified && <Verified />}</b>
          {p.bio ? <small className="muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.bio}</small> : null}
        </span>
      </button>
      {!p.isMe && onToggleFollow && (
        <button type="button" className="chip" disabled={busy} onClick={() => onToggleFollow(p)}>{p.isFollowing ? 'Mengikuti' : 'Ikuti'}</button>
      )}
    </li>
  );
}
