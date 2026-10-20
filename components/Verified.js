// Centang biru untuk akun terverifikasi.
export default function Verified({ size = 16 }) {
  return (
    <svg role="img" aria-label="Akun terverifikasi" viewBox="0 0 24 24" width={size} height={size} style={{ verticalAlign: '-3px', marginLeft: 4, flex: 'none' }}>
      <title>Terverifikasi</title>
      <circle cx="12" cy="12" r="11" fill="#1d9bf0" />
      <path d="M7 12.5l3.4 3.4L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
