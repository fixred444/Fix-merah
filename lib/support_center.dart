import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';

const _red = Color(0xFFE63946);
const _storeKey = 'fm.support.reports.v1';

class SupportCenterPage extends StatefulWidget {
  const SupportCenterPage({super.key});
  @override
  State<SupportCenterPage> createState() => _SupportCenterPageState();
}

class _SupportCenterPageState extends State<SupportCenterPage> {
  List<Map<String, dynamic>> reports = [];
  // Halaman ini hanya bisa dibuka dari akun admin (dicek di ToolsPage),
  // jadi PIN demo tidak dipakai lagi.
  bool adminMode = true;
  bool loading = true;

  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_storeKey);
    if (raw != null) {
      try { reports = (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e)).toList(); } catch (_) {}
    }
    if (mounted) setState(() => loading = false);
  }
  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_storeKey, jsonEncode(reports));
    if (mounted) setState(() {});
  }
  String _date() {
    final d = DateTime.now();
    return '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
  }
  String _id() => 'FM-${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}';

  Future<void> _newReport() async {
    final name = TextEditingController();
    final title = TextEditingController();
    final detail = TextEditingController();
    String category = 'Akun';
    final ok = await showDialog<bool>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setD) => AlertDialog(
      title: const Text('Laporkan masalah'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Nama pengguna')),
        TextField(controller: title, decoration: const InputDecoration(labelText: 'Judul masalah')),
        DropdownButtonFormField<String>(value: category, decoration: const InputDecoration(labelText: 'Kategori'), items: ['Akun','Aplikasi','Parental Control','Pembayaran','Lainnya'].map((e) => DropdownMenuItem(value:e,child:Text(e))).toList(), onChanged:(v)=>setD(()=>category=v ?? 'Lainnya')),
        TextField(controller: detail, maxLines: 4, decoration: const InputDecoration(labelText: 'Jelaskan masalah')),
      ])),
      actions: [TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Batal')), FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Kirim laporan'))],
    )));
    if (ok != true) return;
    if (name.text.trim().isEmpty || title.text.trim().isEmpty || detail.text.trim().isEmpty) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lengkapi semua kolom terlebih dahulu.')));
      return;
    }
    reports.insert(0, {'id':_id(),'name':name.text.trim(),'title':title.text.trim(),'category':category,'detail':detail.text.trim(),'date':_date(),'status':'Menunggu','reply':'','admin':'','resolvedDate':'','certificate':''});
    await _save();
  }

  Future<void> _adminLogin() async {
    final pin = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (ctx)=>AlertDialog(title:const Text('Akses admin'),content:TextField(controller:pin, obscureText:true, keyboardType:TextInputType.number, decoration:const InputDecoration(labelText:'PIN admin')),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Batal')),FilledButton(onPressed:()=>Navigator.pop(ctx,pin.text=='739152'),child:const Text('Masuk'))]));
    if (ok == true) setState(()=>adminMode=true);
    else if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('PIN tidak sesuai.')));
  }

  Future<void> _manage(int i) async {
    final r = reports[i];
    final reply = TextEditingController(text: r['reply'] ?? '');
    final admin = TextEditingController(text: r['admin'] ?? 'Admin Fix Merah');
    final action = await showDialog<String>(context:context,builder:(ctx)=>AlertDialog(title:Text(r['title']),content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Pelapor: ${r['name']}'),Text('Kategori: ${r['category']}'),const SizedBox(height:8),Text(r['detail']),const SizedBox(height:12),TextField(controller:admin,decoration:const InputDecoration(labelText:'Nama admin')),TextField(controller:reply,maxLines:5,decoration:const InputDecoration(labelText:'Balasan / keterangan penyelesaian'))])),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,'cancel'),child:const Text('Batal')),TextButton(onPressed:()=>Navigator.pop(ctx,'progress'),child:const Text('Proses')),FilledButton(onPressed:()=>Navigator.pop(ctx,'resolve'),child:const Text('Tandai Terselesaikan'))]));
    if (action == null || action == 'cancel') return;
    r['reply']=reply.text.trim(); r['admin']=admin.text.trim().isEmpty?'Admin Fix Merah':admin.text.trim();
    if (action=='progress') { r['status']='Sedang diproses'; }
    if (action=='resolve') {
      if (reply.text.trim().isEmpty) { if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Isi keterangan penyelesaian terlebih dahulu.'))); return; }
      r['status']='Terselesaikan'; r['resolvedDate']=_date(); r['certificate']='SERT-${DateTime.now().millisecondsSinceEpoch}';
    }
    await _save();
  }

  Future<Uint8List> _certificate(Map<String, dynamic> r) async {
    final doc = pw.Document();
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(38),
        build: (ctx) {
          return pw.Container(
            padding: const pw.EdgeInsets.all(26),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.red, width: 3),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.SizedBox(height: 18),
                pw.Text(
                  'FIX MERAH',
                  style: pw.TextStyle(
                    fontSize: 18,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.red,
                  ),
                ),
                pw.SizedBox(height: 26),
                pw.Text(
                  'SERTIFIKAT PENYELESAIAN',
                  style: pw.TextStyle(
                    fontSize: 22,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.Text(
                  'PUSAT BANTUAN FIX MERAH',
                  style: const pw.TextStyle(fontSize: 10),
                ),
                pw.SizedBox(height: 34),
                pw.Text(
                  'Dengan ini menyatakan bahwa laporan dari:',
                  style: const pw.TextStyle(fontSize: 12),
                ),
                pw.SizedBox(height: 12),
                pw.Text(
                  '${r['name'] ?? '-'}',
                  style: pw.TextStyle(
                    fontSize: 20,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 20),
                pw.Text(
                  'Judul laporan',
                  style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey),
                ),
                pw.Text(
                  '${r['title'] ?? '-'}',
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(
                    fontSize: 15,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 18),
                pw.Text(
                  'telah ditangani dan dinyatakan selesai dengan keterangan:',
                  style: const pw.TextStyle(fontSize: 11),
                ),
                pw.SizedBox(height: 10),
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(14),
                  decoration: const pw.BoxDecoration(color: PdfColors.grey100),
                  child: pw.Text(
                    '${r['reply'] ?? '-'}',
                    textAlign: pw.TextAlign.center,
                    style: const pw.TextStyle(fontSize: 11),
                  ),
                ),
                pw.Spacer(),
                pw.Divider(),
                pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          'Nomor: ${r['certificate'] ?? '-'}',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                        pw.Text(
                          'Tanggal: ${r['resolvedDate'] ?? '-'}',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                      ],
                    ),
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.center,
                      children: [
                        pw.Text(
                          'Admin Fix Merah',
                          style: const pw.TextStyle(fontSize: 9),
                        ),
                        pw.SizedBox(height: 24),
                        pw.Text(
                          '${r['admin'] ?? 'Admin Fix Merah'}',
                          style: pw.TextStyle(
                            fontSize: 11,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                pw.SizedBox(height: 18),
                pw.Text(
                  'Dokumen ini diterbitkan secara digital oleh aplikasi Fix Merah.',
                  style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey),
                ),
              ],
            ),
          );
        },
      ),
    );
    return doc.save();
  }
  Future<void> _showCertificate(Map<String,dynamic> r) async {
    final bytes=await _certificate(r);
    if(!mounted)return;
    await Printing.sharePdf(bytes:bytes,filename:'${r['certificate']}.pdf');
  }

  @override
  Widget build(BuildContext context) {
    final shown=reports;
    return Scaffold(appBar:AppBar(title:Text(adminMode?'Panel Admin':'Pusat Bantuan'),actions:const []),
      floatingActionButton:adminMode?null:FloatingActionButton.extended(backgroundColor:_red,onPressed:_newReport,icon:const Icon(Icons.add,color:Colors.white),label:const Text('Buat laporan',style:TextStyle(color:Colors.white))),
      body:loading?const Center(child:CircularProgressIndicator()):shown.isEmpty?Center(child:Column(mainAxisSize:MainAxisSize.min,children:[const Icon(Icons.support_agent,size:64,color:_red),const SizedBox(height:12),Text(adminMode?'Belum ada laporan masuk':'Belum ada laporan'),if(!adminMode)const Text('Tekan “Buat laporan” jika membutuhkan bantuan.')])):ListView.builder(padding:const EdgeInsets.fromLTRB(14,14,14,90),itemCount:shown.length,itemBuilder:(ctx,i){final r=shown[i];return Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Row(children:[Expanded(child:Text(r['title'],style:const TextStyle(fontWeight:FontWeight.bold,fontSize:16))),_status(r['status'])]),const SizedBox(height:6),Text('${r['name']} • ${r['category']} • ${r['date']}',style:Theme.of(context).textTheme.bodySmall),const SizedBox(height:8),Text(r['detail']),if((r['reply']??'').toString().isNotEmpty)...[const Divider(),const Text('Balasan admin',style:TextStyle(fontWeight:FontWeight.bold)),Text(r['reply'])],if(adminMode)Align(alignment:Alignment.centerRight,child:TextButton.icon(onPressed:()=>_manage(i),icon:const Icon(Icons.edit_note),label:const Text('Kelola laporan'))),if(!adminMode&&r['status']=='Terselesaikan')Align(alignment:Alignment.centerRight,child:FilledButton.icon(onPressed:()=>_showCertificate(r),icon:const Icon(Icons.picture_as_pdf),label:const Text('Lihat / Bagikan sertifikat')))])));}),
    );
  }
  Widget _status(String s){final c=s=='Terselesaikan'?Colors.green:s=='Sedang diproses'?Colors.orange:_red;return Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:c.withOpacity(.12),borderRadius:BorderRadius.circular(20)),child:Text(s,style:TextStyle(color:c,fontSize:11,fontWeight:FontWeight.bold)));}
}
