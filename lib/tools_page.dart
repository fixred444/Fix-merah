import 'package:flutter/material.dart';

import 'html_deploy.dart';
import 'permissions_page.dart';
import 'parental_control.dart';
import 'web_to_apk.dart';
import 'support_center.dart';

const Color _kRed = Color(0xFFE63946);

/// Menu alat: dibuka dari tombol roket.
class ToolsPage extends StatelessWidget {
  const ToolsPage({super.key, this.protectedName, this.isAdmin = false});

  /// Nama proyek Vercel yang tidak boleh ditimpa (website utama).
  final String? protectedName;

  /// Hanya akun admin yang melihat menu Pusat Bantuan & Laporan.
  final bool isAdmin;

  void _go(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alat')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _tile(
              icon: Icons.rocket_launch_rounded,
              title: 'Upload HTML ke Vercel',
              sub: 'Ubah file HTML jadi website, nama domain bisa diatur',
              onTap: () => _go(context, HtmlDeployPage(protectedName: protectedName)),
            ),
            _tile(
              icon: Icons.android_rounded,
              title: 'Web ke APK',
              sub: 'Ubah alamat website jadi APK langsung (dibangun di GitHub)',
              onTap: () => _go(context, const WebToApkPage()),
            ),
            _tile(
              icon: Icons.family_restroom_rounded,
              title: 'Parental Control',
              sub: 'Buat profil anak, atur jadwal dan siapkan kontrol perangkat',
              onTap: () => _go(context, const ParentalControlPage()),
            ),
            if (isAdmin)
              _tile(
                icon: Icons.support_agent_rounded,
                title: 'Pusat Bantuan & Laporan (Admin)',
                sub: 'Kelola laporan masuk, balas, dan terbitkan sertifikat PDF',
                onTap: () => _go(context, const SupportCenterPage()),
              ),
            _tile(
              icon: Icons.verified_user_rounded,
              title: 'Izin aplikasi',
              sub: 'Lihat dan aktifkan kamera, notifikasi, foto/video, mikrofon, lokasi',
              onTap: () => _go(context, const PermissionsPage()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile({required IconData icon, required String title, required String sub, required VoidCallback onTap}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Icon(icon, color: _kRed, size: 28),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(sub),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}
