const COLORS = ['#e63946', '#2bb8a3', '#5b5bd6', '#f59e0b', '#0ea5e9', '#d946ef'];
export default function Avatar({ name = '?', size = 44 }) {
  const n = String(name || '?');
  const c = COLORS[[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.42, flex: 'none' }}>
      {n.charAt(0).toUpperCase()}
    </span>
  );
}
