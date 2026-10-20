# Fix Merah

Login/daftar, menu utama bertema liquid glass (bisa ganti ke komik 3D), kirim email permohonan lewat Gmail milik user sendiri. Next.js + Supabase, deploy GitHub → Vercel.

## Pasang
1. Buat project di supabase.com. Di SQL Editor, jalankan isi `supabase/schema.sql`.
2. Di Supabase: Authentication → Providers → Email → matikan "Confirm email" (opsional, supaya daftar langsung masuk).
3. Upload isi folder ini ke repo GitHub.
4. Di Vercel: Add New → Project → pilih repo → isi Environment Variables sesuai `.env.example` → Deploy.
   - `ENCRYPT_KEY`: buat dengan `openssl rand -hex 32` (jangan diganti setelah ada data).
   - `ADMIN_EMAILS`: email yang jadi admin (daftar dulu pakai email itu).
5. Masuk sebagai admin → tab Admin → tambah teks permohonan dan email tujuan.

## Cara kerja
- User menambah Gmail + app password (16 karakter), nomor, lalu memilih teks dan tujuan. Email dikirim dari Gmail user sendiri.
- Template memakai `{nomor}` sebagai pengganti nomor.
- App password disimpan terenkripsi AES-256-GCM. Semua tabel diblokir dari akses langsung browser (RLS), hanya server yang bisa membaca.
- Batas wajar: `DAILY_LIMIT` per user per hari dan `PER_NUMBER_LIMIT` per nomor per hari (zona WIB).
- Riwayat pengiriman tersimpan per user.


## Sender Pribadi & Sender Global

1. Jalankan SQL terbaru pada `supabase/schema.sql` di Supabase SQL Editor. Untuk proyek lama, bagian `ALTER TABLE` berikut perlu dijalankan jika kolom belum ada: `alter table accounts add column if not exists shared_enabled boolean not null default false;` lalu buat tabel `app_settings` sesuai schema.
2. Sender Pribadi memakai akun Gmail milik pengguna yang sedang masuk.
3. Sender Global hanya memakai akun yang pemiliknya secara eksplisit menekan **Izinkan berbagi**. Pemilik bisa mematikan berbagi kapan saja. App Password tetap terenkripsi di server dan tidak dikirim ke browser.
4. Admin dapat mengatur kuota harian per pengguna dari halaman Admin. `PER_SENDER_DAILY_LIMIT` membatasi pengiriman per akun global per hari (default 10; maksimum efektif 20).
5. Rotasi global hanya membantu membagi pemakaian antar-pengirim yang setuju; fitur ini tidak dimaksudkan untuk melewati batas Gmail atau kebijakan penyedia. Gunakan untuk email yang sah, relevan, dan tidak berulang secara massal.
6. Setelah mengubah schema, commit semua file ke GitHub lalu deploy ulang di Vercel. Pastikan environment variables dari `.env.example` terisi di Vercel.

## Notifikasi HP (panel notifikasi sistem)

Pengumuman admin juga muncul sebagai notifikasi biasa di panel notifikasi HP (Web Push), meski tab sedang di latar belakang atau layar terkunci.

1. Jalankan `supabase/push.sql` di Supabase SQL Editor (atau `update-semua.sql` yang sudah memuatnya).
2. Buat kunci: `npx web-push generate-vapid-keys`. Isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` (`mailto:emailmu`) di Vercel → Environment Variables, lalu Redeploy.
3. Setiap pengguna menekan **Aktifkan notifikasi** sekali di halaman menu dan memilih Izinkan.
4. Android/Chrome: langsung bekerja. iPhone: wajib "Tambah ke Layar Utama" (iOS 16.4+) lalu buka dari ikonnya.
