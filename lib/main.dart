import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import 'tools_page.dart';

// Alamat situs. Ganti kalau domain berubah, lalu bangun ulang APK-nya.
const String kAppUrl = 'https://fixmerahapelxz7.vercel.app/';
const Color kRed = Color(0xFFE63946);
const MethodChannel _native = MethodChannel('fixmerah/native');

// ---- Video pembuka (intro) ----
// Ganti teks di bawah sesuai kebutuhan. Set kTampilkanIntro = false untuk mematikan intro.
const bool kTampilkanIntro = true;
const String kDevName = 'Apelxz7';
const String kDevRole = 'Pembuat & pengembang Fix Merah';

// ---- Musik latar di tampilan utama (diulang terus) ----
// Mulai setelah intro selesai/dilewati. Set kPutarMusik = false untuk mematikan.
const bool kPutarMusik = true;
const double kVolumeMusik = 0.6; // 0.0 - 1.0

// ---- Video latar HANYA di dalam kartu cuaca (ukuran videonya pas dengan kartu) ----
// kRedupKartu: seberapa gelap video diredupkan (0.0 = asli, 1.0 = hitam). Naikkan kalau masih terlalu terang.
const bool kVideoKartuCuaca = true;
const double kRedupKartu = 0.5;

// ---------------------------------------------------------------------------
// Skrip yang disuntik ke halaman. WebView Android tidak punya Notification API,
// jadi tombol "aktifkan notifikasi" di website selalu gagal. Skrip ini membuat
// API itu seolah-olah ada dan meneruskannya ke notifikasi asli Android.
// ---------------------------------------------------------------------------
const String kShim = r'''
(function () {
  if (window.__fmShim) return;
  window.__fmShim = true;

  function send(name, data) {
    try { return window.flutter_inappwebview.callHandler(name, data); } catch (e) {}
  }

  function isCall(title, o) {
    var tag = String(o.tag || '');
    var d = o.data || {};
    if (/^call/i.test(tag)) return true;
    if (d.type === 'call' || d.call === true) return true;
    return /^panggilan (masuk|suara|video)/i.test(String(title || ''));
  }

  function deliver(title, o) {
    o = o || {};
    if (isCall(title, o)) {
      var d = o.data || {};
      send('fmCall', {
        name: String(d.name || o.name || o.body || title || 'Panggilan'),
        id: String(d.id || o.tag || Date.now())
      });
      return;
    }
    // Saat app sedang dibuka, website sudah punya banner sendiri.
    if (document.visibilityState === 'visible') return;
    send('fmNotify', {
      title: String(title || 'Fix Merah'),
      body: String(o.body || ''),
      tag: String(o.tag || '')
    });
  }

  function N(title, opts) {
    opts = opts || {};
    this.title = title;
    this.body = opts.body || '';
    this.tag = opts.tag || '';
    this.data = opts.data;
    this.onclick = null; this.onclose = null; this.onerror = null; this.onshow = null;
    deliver(title, opts);
    var self = this;
    setTimeout(function () { if (typeof self.onshow === 'function') self.onshow(); }, 0);
  }
  N.prototype.close = function () {};
  N.prototype.addEventListener = function () {};
  N.prototype.removeEventListener = function () {};
  N.permission = 'granted';
  N.maxActions = 2;
  N.requestPermission = function (cb) {
    send('fmRequestNotifPermission', {});
    if (typeof cb === 'function') cb('granted');
    return Promise.resolve('granted');
  };
  try {
    Object.defineProperty(window, 'Notification', { value: N, configurable: true, writable: true });
  } catch (e) { window.Notification = N; }

  try {
    if (window.ServiceWorkerRegistration) {
      ServiceWorkerRegistration.prototype.showNotification = function (t, o) {
        deliver(t, o || {});
        return Promise.resolve();
      };
    }
  } catch (e) {}

  try {
    var q = navigator.permissions && navigator.permissions.query;
    if (q) {
      navigator.permissions.query = function (d) {
        if (d && d.name === 'notifications') {
          return Promise.resolve({
            state: 'granted', onchange: null,
            addEventListener: function () {}, removeEventListener: function () {}
          });
        }
        return q.call(navigator.permissions, d);
      };
    }
  } catch (e) {}

  // Pintu resmi untuk website: dipanggil langsung dari kode website.
  window.FixMerahNative = {
    isApp: true,
    notify: function (title, body) { send('fmNotify', { title: title, body: body || '' }); },
    incomingCall: function (name, id) { send('fmCall', { name: String(name || 'Panggilan'), id: String(id || Date.now()) }); },
    endCall: function () { send('fmCallEnd', {}); },
    openTools: function () { send('fmOpenTools', {}); },
    // Website memberi tahu status akun: setSession(true, false) = login biasa,
    // setSession(true, true) = login admin, setSession(false, false) = logout.
    setSession: function (loggedIn, isAdmin) {
      send('fmSession', { loggedIn: !!loggedIn, isAdmin: !!isAdmin });
    }
  };
})();
''';

// Memasang video sebagai latar di dalam kartu cuaca saja. Kartu dikenali dari
// tulisan "Kelembapan" + "Kecepatan angin" + tanda derajat. Teks gelap di dalam
// kartu otomatis diputihkan supaya terbaca di atas video yang diredupkan.
const String kWxShim = r'''
(function () {
  if (window.__fmWx) return;
  window.__fmWx = true;
  var DIM = __DIM__;
  var blobUrl = null, loading = false, failed = false, okFlag = false, timer = null;
  var changed = [];

  function parse(c) {
    var n = String(c).match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (!n || n.length < 3) return null;
    return { r: +n[0], g: +n[1], b: +n[2], a: n.length > 3 ? +n[3] : 1 };
  }
  function lum(c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
  function remember(el, prop) { changed.push([el, prop]); }

  function textOf(re) {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { if (re.test(n.nodeValue)) return n.parentElement; }
    return null;
  }

  function findCard() {
    var a = textOf(/Kelembapan/i), c = textOf(/Kecepatan angin/i);
    if (!a || !c) return null;
    var node = a;
    while (node && !node.contains(c)) node = node.parentElement;
    while (node && node !== document.body && (node.textContent || '').indexOf('\u00b0') < 0) node = node.parentElement;
    if (!node || node === document.body) return null;
    var cur = node, steps = 0;
    while (cur && cur !== document.body && steps < 5) {
      var bg = parse(getComputedStyle(cur).backgroundColor);
      if (bg && bg.a > 0.9) return cur;
      cur = cur.parentElement;
      steps++;
    }
    return node;
  }

  function b64ToUrl(b64) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([u], { type: 'video/mp4' }));
  }

  function loadUrl(cb) {
    if (blobUrl) { cb(blobUrl); return; }
    if (loading || failed) return;
    loading = true;
    try {
      window.flutter_inappwebview.callHandler('fmGetWxVideo').then(function (b64) {
        loading = false;
        if (!b64) { failed = true; return; }
        try { blobUrl = b64ToUrl(b64); } catch (e) { failed = true; return; }
        cb(blobUrl);
      }, function () { loading = false; });
    } catch (e) { loading = false; }
  }

  function unrecolor() {
    for (var i = 0; i < changed.length; i++) changed[i][0].style.removeProperty(changed[i][1]);
    changed = [];
  }

  function fail(box) {
    failed = true;
    try { box.remove(); } catch (e) {}
    unrecolor();
  }

  function recolor(card) {
    var els = card.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('[data-fm-wx]')) continue;
      var cs = getComputedStyle(el);
      var own = false;
      for (var k = 0; k < el.childNodes.length; k++) {
        var nd = el.childNodes[k];
        if (nd.nodeType === 3 && /\S/.test(nd.nodeValue)) { own = true; break; }
      }
      if (own) {
        var col = parse(cs.color);
        if (col && lum(col) < 0.6) {
          el.style.setProperty('color', '#fff', 'important'); remember(el, 'color');
          el.style.setProperty('text-shadow', '0 1px 3px rgba(0,0,0,.65)', 'important'); remember(el, 'text-shadow');
        }
      }
      // Garis pemisah: elemen tipis, atau elemen dengan satu garis di atas/bawah saja.
      var r = el.getBoundingClientRect();
      if (r.width > 40 && r.height <= 4) {
        var bgc = parse(cs.backgroundColor);
        if (bgc && bgc.a > 0.4 && lum(bgc) < 0.5) {
          el.style.setProperty('background-color', 'rgba(255,255,255,.75)', 'important'); remember(el, 'background-color');
        }
      }
      var sides = ['Top', 'Right', 'Bottom', 'Left'], used = [];
      for (var j = 0; j < 4; j++) {
        if (parseFloat(cs['border' + sides[j] + 'Width']) > 0 && cs['border' + sides[j] + 'Style'] !== 'none') used.push(sides[j]);
      }
      if (used.length === 1 && (used[0] === 'Top' || used[0] === 'Bottom')) {
        var bc = parse(cs['border' + used[0] + 'Color']);
        if (bc && bc.a > 0.3 && lum(bc) < 0.5) {
          var prop = 'border-' + used[0].toLowerCase() + '-color';
          el.style.setProperty(prop, 'rgba(255,255,255,.75)', 'important'); remember(el, prop);
        }
      }
    }
  }

  function apply(card, url) {
    if (card.querySelector(':scope > [data-fm-wx]')) return;
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.style.isolation = 'isolate';
    var box = document.createElement('div');
    box.setAttribute('data-fm-wx', '1');
    box.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:-1;border-radius:inherit;overflow:hidden;pointer-events:none;background:#101820';
    var v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.preload = 'auto';
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    v.addEventListener('loadeddata', function () { okFlag = true; recolor(card); });
    v.addEventListener('error', function () { if (!okFlag) fail(box); });
    v.src = url;
    var dim = document.createElement('div');
    dim.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,' + DIM + ')';
    box.appendChild(v);
    box.appendChild(dim);
    card.insertBefore(box, card.firstChild);
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
    try {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { var q = v.play(); if (q && q.catch) q.catch(function () {}); }
          else { v.pause(); }
        });
      }).observe(card);
    } catch (e) {}
  }

  function ensure() {
    if (failed || !document.body) return;
    if ((document.body.textContent || '').indexOf('Kelembapan') < 0) return;
    var card = findCard();
    if (!card) return;
    if (card.querySelector(':scope > [data-fm-wx]')) { if (okFlag) recolor(card); return; }
    loadUrl(function (url) { var c2 = findCard(); if (c2) apply(c2, url); });
  }

  function sched() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; ensure(); }, 350);
  }

  function boot() {
    ensure();
    setTimeout(ensure, 1200);
    setTimeout(ensure, 3500);
    try { new MutationObserver(sched).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
''';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase Android options dibaca dari android/app/google-services.json
  // melalui plugin Google Services. Jika konfigurasi gagal, aplikasi utama
  // tetap dapat dibuka; fitur sinkronisasi akan menampilkan status belum siap.
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('Firebase belum siap: $e');
  }
  runApp(const FixMerahApp());
}

// ---------------------------------------------------------------------------
// Notifikasi asli Android
// ---------------------------------------------------------------------------
class Notif {
  static final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
  static const String msgChannel = 'fm_pesan_v1';
  static const String callChannel = 'fm_panggilan_v1';
  static const int callId = 7001;
  static const String ringtone = 'content://settings/system/ringtone';
  static int _n = 100;
  static void Function(String? payload, String? actionId)? onTap;

  static Future<void> init() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('ic_stat'),
    );
    await plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (r) => onTap?.call(r.payload, r.actionId),
    );
    final a = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await a?.createNotificationChannel(const AndroidNotificationChannel(
      msgChannel,
      'Pesan dan info',
      description: 'Pesan baru dan pemberitahuan dari Fix Merah',
      importance: Importance.high,
    ));
    await a?.createNotificationChannel(AndroidNotificationChannel(
      callChannel,
      'Panggilan masuk',
      description: 'Dering panggilan masuk',
      importance: Importance.max,
      playSound: true,
      sound: const UriAndroidNotificationSound(ringtone),
      audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
      enableVibration: true,
      vibrationPattern: Int64List.fromList(<int>[0, 800, 600, 800, 600, 800]),
    ));
  }

  static Future<void> show(String title, String body, {String payload = 'open'}) {
    final d = AndroidNotificationDetails(
      msgChannel,
      'Pesan dan info',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_stat',
      color: kRed,
    );
    return plugin.show(_n++, title, body, NotificationDetails(android: d), payload: payload);
  }

  static Future<void> showCall(String name, String id) {
    final d = AndroidNotificationDetails(
      callChannel,
      'Panggilan masuk',
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: true,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: 45000,
      icon: 'ic_stat',
      color: kRed,
      visibility: NotificationVisibility.public,
      sound: const UriAndroidNotificationSound(ringtone),
      audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
      vibrationPattern: Int64List.fromList(<int>[0, 800, 600, 800, 600, 800]),
      // FLAG_INSISTENT (4): dering berulang sampai dijawab / habis waktu.
      additionalFlags: Int32List.fromList(<int>[4]),
      actions: const <AndroidNotificationAction>[
        AndroidNotificationAction('decline', 'Tolak', showsUserInterface: true, cancelNotification: true),
        AndroidNotificationAction('accept', 'Terima', showsUserInterface: true, cancelNotification: true),
      ],
    );
    return plugin.show(
      callId,
      name,
      'Panggilan masuk Fix Merah',
      NotificationDetails(android: d),
      payload: 'call:${jsonEncode({'id': id, 'name': name})}',
    );
  }

  static Future<void> cancelCall() => plugin.cancel(callId);
}

class FixMerahApp extends StatelessWidget {
  const FixMerahApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fix Merah',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: kRed, brightness: Brightness.dark),
      ),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> with WidgetsBindingObserver {
  InAppWebViewController? _web;
  late final PullToRefreshController _refresh;
  double _progress = 0;
  bool _error = false;
  bool _pageReady = false;
  bool _showIntro = kTampilkanIntro;
  bool _loggedIn = false; // tombol Alat hanya muncul setelah login
  bool _isAdmin = false;  // menu Pusat Bantuan hanya untuk admin
  final Completer<void> _introDone = Completer<void>();
  VideoPlayerController? _music;
  String? _wxB64;
  bool _musicStarted = false;
  bool _musicMuted = false;
  AppLifecycleState _life = AppLifecycleState.resumed;

  final ValueNotifier<Map<String, String>?> _call = ValueNotifier<Map<String, String>?>(null);
  Timer? _callTimer;
  final List<String> _queuedJs = <String>[];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh = PullToRefreshController(
      settings: PullToRefreshSettings(color: kRed),
      onRefresh: () async {
        await _web?.reload();
      },
    );
    if (!kTampilkanIntro) _finishIntro();
    _boot();
  }

  void _finishIntro() {
    if (!_introDone.isCompleted) _introDone.complete();
    if (mounted && _showIntro) setState(() => _showIntro = false);
    _syncMedia();
    _startMusic();
  }

  // ---- Musik latar (diulang terus) ----
  Future<void> _startMusic() async {
    if (!kPutarMusik || _musicStarted) return;
    _musicStarted = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      _musicMuted = prefs.getBool('musik_mati') ?? false;
      final m = VideoPlayerController.asset(
        'assets/musik.mp3',
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );
      _music = m;
      await m.initialize();
      await m.setLooping(true);
      await m.setVolume(kVolumeMusik);
      if (mounted) setState(() {});
      await _syncMedia();
    } catch (_) {
      _music?.dispose();
      _music = null;
    }
  }

  // Musik hanya jalan saat app terbuka, bukan di intro, dan tidak ada
  // panggilan masuk. Musik juga mengikuti tombol bisu.
  Future<void> _syncMedia() async {
    final active = !_showIntro && _life == AppLifecycleState.resumed && _call.value == null;
    await _setPlaying(_music, active && !_musicMuted);
  }

  Future<void> _setPlaying(VideoPlayerController? c, bool want) async {
    if (c == null || !c.value.isInitialized) return;
    try {
      if (want && !c.value.isPlaying) {
        await c.play();
      } else if (!want && c.value.isPlaying) {
        await c.pause();
      }
    } catch (_) {}
  }

  Future<void> _toggleMusic() async {
    setState(() => _musicMuted = !_musicMuted);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('musik_mati', _musicMuted);
    } catch (_) {}
    await _syncMedia();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _callTimer?.cancel();
    _music?.dispose();
    _call.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _life = state;
    _syncMedia();
    // Jaga agar JavaScript website tetap jalan saat app di background.
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _keepWebAlive();
    }
  }

  void _keepWebAlive() {
    try {
      _web?.resumeTimers();
    } catch (_) {}
  }

  // ---- Startup: notifikasi, izin, service penjaga ----
  Future<void> _boot() async {
    Notif.onTap = _onNotifTap;
    await Notif.init();
    final d = await Notif.plugin.getNotificationAppLaunchDetails();
    if ((d?.didNotificationLaunchApp ?? false) && d!.notificationResponse != null) {
      _finishIntro(); // dibuka dari notifikasi (mis. panggilan): langsung masuk
      _onNotifTap(d.notificationResponse!.payload, d.notificationResponse!.actionId);
    }
    // Tunggu intro selesai supaya dialog izin tidak menutupi video.
    await _introDone.future;
    await _askPermissions();
  }

  Future<bool> _askPermissions({bool force = false}) async {
    final st = await Permission.notification.request();
    final prefs = await SharedPreferences.getInstance();

    // Izin tampil layar penuh (Android 14+). Ditanya sekali saja.
    if (force || !(prefs.getBool('asked_fsi') ?? false)) {
      await prefs.setBool('asked_fsi', true);
      try {
        final a = Notif.plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        await a?.requestFullScreenIntentPermission();
      } catch (_) {}
    }

    await _startKeepAlive();

    // Minta dikecualikan dari penghemat baterai supaya tidak dimatikan sistem.
    if (force || !(prefs.getBool('asked_battery') ?? false)) {
      await prefs.setBool('asked_battery', true);
      try {
        if (!(await Permission.ignoreBatteryOptimizations.status).isGranted) {
          await Permission.ignoreBatteryOptimizations.request();
        }
      } catch (_) {}
    }
    return st.isGranted;
  }

  Future<void> _startKeepAlive() async {
    try {
      await _native.invokeMethod('keepAlive', true);
    } catch (_) {}
  }

  // ---- Panggilan masuk ----
  Map<String, String>? _parseCall(String? payload) {
    if (payload == null || !payload.startsWith('call:')) return null;
    try {
      final m = jsonDecode(payload.substring(5)) as Map;
      return {'id': '${m['id'] ?? ''}', 'name': '${m['name'] ?? 'Panggilan'}'};
    } catch (_) {
      return null;
    }
  }

  void _onNotifTap(String? payload, String? actionId) {
    final c = _parseCall(payload);
    if (c == null) return;
    if (actionId == 'decline') {
      _dispatchCall('decline', c['id'] ?? '');
      _endCall();
    } else if (actionId == 'accept') {
      _dispatchCall('accept', c['id'] ?? '');
      _endCall();
    } else {
      _showCall(c);
    }
  }

  void _showCall(Map<String, String> c) {
    _callTimer?.cancel();
    _call.value = c;
    _syncMedia();
    _native.invokeMethod('showOnLock', true).catchError((_) {});
    _callTimer = Timer(const Duration(seconds: 45), () {
      _dispatchCall('timeout', c['id'] ?? '');
      _endCall();
    });
  }

  void _endCall() {
    _callTimer?.cancel();
    _call.value = null;
    _syncMedia();
    Notif.cancelCall();
    _native.invokeMethod('showOnLock', false).catchError((_) {});
  }

  void _answer(bool accept) {
    final id = _call.value?['id'] ?? '';
    _dispatchCall(accept ? 'accept' : 'decline', id);
    _endCall();
  }

  // Kabari website: window 'fixmerah-call' dengan detail {action, id}.
  void _dispatchCall(String action, String id) {
    final js = "(function(){var d={action:${jsonEncode(action)},id:${jsonEncode(id)}};"
        "try{window.dispatchEvent(new CustomEvent('fixmerah-call',{detail:d}));}catch(e){}"
        "try{if(typeof window.fixmerahOnCall==='function')window.fixmerahOnCall(d);}catch(e){}})();";
    if (_web != null && _pageReady) {
      _web!.evaluateJavascript(source: js);
    } else {
      _queuedJs.add(js);
    }
  }

  void _flushQueue() {
    if (_web == null) return;
    for (final js in _queuedJs) {
      _web!.evaluateJavascript(source: js);
    }
    _queuedJs.clear();
  }

  Map<String, dynamic> _asMap(List<dynamic> args) {
    if (args.isNotEmpty && args.first is Map) {
      return Map<String, dynamic>.from(args.first as Map);
    }
    return <String, dynamic>{};
  }

  void _registerHandlers(InAppWebViewController c) {
    c.addJavaScriptHandler(
      handlerName: 'fmNotify',
      callback: (args) async {
        final m = _asMap(args);
        await Notif.show('${m['title'] ?? 'Fix Merah'}', '${m['body'] ?? ''}');
        return true;
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmCall',
      callback: (args) async {
        final m = _asMap(args);
        final name = '${m['name'] ?? 'Panggilan'}';
        final id = '${m['id'] ?? DateTime.now().millisecondsSinceEpoch}';
        await Notif.showCall(name, id); // bunyi dering + layar penuh saat terkunci
        if (_life == AppLifecycleState.resumed) {
          _showCall({'id': id, 'name': name});
        }
        return true;
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmGetWxVideo',
      callback: (args) async {
        try {
          if (_wxB64 == null) {
            final bd = await rootBundle.load('assets/kartu_cuaca.mp4');
            _wxB64 = base64Encode(bd.buffer.asUint8List(bd.offsetInBytes, bd.lengthInBytes));
          }
          return _wxB64;
        } catch (_) {
          return null;
        }
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmCallEnd',
      callback: (args) async {
        _endCall();
        return true;
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmSession',
      callback: (args) async {
        final m = _asMap(args);
        if (!mounted) return false;
        setState(() {
          _loggedIn = m['loggedIn'] == true;
          _isAdmin = _loggedIn && m['isAdmin'] == true;
        });
        return true;
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmOpenTools',
      callback: (args) async {
        _openTools();
        return true;
      },
    );
    c.addJavaScriptHandler(
      handlerName: 'fmRequestNotifPermission',
      callback: (args) async {
        return await _askPermissions(force: true);
      },
    );
  }

  // Alat: upload HTML jadi website Vercel.
  void _openTools() {
    if (!mounted || !_loggedIn) return; // belum login: alat tidak bisa dibuka
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ToolsPage(
        protectedName: Uri.parse(kAppUrl).host.split('.').first,
        isAdmin: _isAdmin,
      ),
    ));
  }

  Future<void> _retry() async {
    setState(() => _error = false);
    await _web?.loadUrl(urlRequest: URLRequest(url: WebUri(kAppUrl)));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Tombol kembali Android: mundur di dalam situs dulu, baru keluar aplikasi.
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (_showIntro) {
          _finishIntro();
          return;
        }
        if (_call.value != null) return; // jangan keluar saat telepon berdering
        final c = _web;
        if (c != null && await c.canGoBack()) {
          await c.goBack();
        } else {
          await SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF111111),
        body: SafeArea(
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(kAppUrl)),
                initialUserScripts: UnmodifiableListView<UserScript>([
                  UserScript(
                    source: kShim,
                    injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                  ),
                  if (kVideoKartuCuaca)
                    UserScript(
                      source: kWxShim.replaceAll('__DIM__', kRedupKartu.toString()),
                      injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                    ),
                ]),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  cacheEnabled: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  useHybridComposition: true,
                  geolocationEnabled: true,
                  supportZoom: false,
                ),
                pullToRefreshController: _refresh,
                onWebViewCreated: (c) {
                  _web = c;
                  _registerHandlers(c);
                },
                onLoadStart: (c, url) {
                  _pageReady = false;
                  setState(() => _error = false);
                },
                onLoadStop: (c, url) {
                  _pageReady = true;
                  _refresh.endRefreshing();
                  _flushQueue();
                },
                onProgressChanged: (c, p) {
                  if (p >= 100) _refresh.endRefreshing();
                  setState(() => _progress = p / 100);
                },
                onReceivedError: (c, request, error) {
                  if (request.isForMainFrame == true) {
                    _refresh.endRefreshing();
                    setState(() => _error = true);
                  }
                },
                // Izin mikrofon / kamera untuk panggilan suara dan kirim foto.
                onPermissionRequest: (c, request) async {
                  var ok = true;
                  for (final r in request.resources) {
                    Permission? p;
                    if (r == PermissionResourceType.MICROPHONE) p = Permission.microphone;
                    if (r == PermissionResourceType.CAMERA) p = Permission.camera;
                    if (p != null && !(await p.request()).isGranted) ok = false;
                  }
                  return PermissionResponse(
                    resources: request.resources,
                    action: ok ? PermissionResponseAction.GRANT : PermissionResponseAction.DENY,
                  );
                },
                // Izin lokasi untuk kartu cuaca.
                onGeolocationPermissionsShowPrompt: (c, origin) async {
                  final s = await Permission.locationWhenInUse.request();
                  return GeolocationPermissionShowPromptResponse(
                    origin: origin,
                    allow: s.isGranted,
                    retain: true,
                  );
                },
              ),
              if (_progress < 1 && !_error)
                LinearProgressIndicator(value: _progress, minHeight: 3, color: kRed, backgroundColor: Colors.transparent),
              if (_error) _offline(),
              if (_music != null && !_showIntro)
                Positioned(
                  left: 10,
                  bottom: 10,
                  child: Opacity(
                    opacity: 0.6,
                    child: Material(
                      color: Colors.black54,
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _toggleMusic,
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            _musicMuted ? Icons.music_off_rounded : Icons.music_note_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              if (!_showIntro && _loggedIn)
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: Opacity(
                    opacity: 0.6,
                    child: Material(
                      color: Colors.black54,
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _openTools,
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.rocket_launch_rounded, color: Colors.white, size: 20),
                        ),
                      ),
                    ),
                  ),
                ),
              if (_showIntro) _IntroScreen(key: const ValueKey('intro'), onFinish: _finishIntro),
              ValueListenableBuilder<Map<String, String>?>(
                valueListenable: _call,
                builder: (context, c, _) {
                  if (c == null) return const SizedBox.shrink();
                  return _CallOverlay(
                    name: c['name'] ?? 'Panggilan',
                    onAccept: () => _answer(true),
                    onDecline: () => _answer(false),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _offline() {
    return Container(
      color: const Color(0xFF111111),
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          ClipRRect(borderRadius: BorderRadius.circular(22), child: Image.asset('assets/icon.png', width: 96, height: 96)),
          const SizedBox(height: 18),
          const Text('Fix Merah', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text('Tidak bisa terhubung ke internet.\nSambungkan internet lalu coba lagi.', textAlign: TextAlign.center),
          const SizedBox(height: 20),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kRed),
            onPressed: _retry,
            child: const Text('Coba lagi'),
          ),
        ],
      ),
    );
  }
}

// Layar panggilan masuk ala WhatsApp.
class _CallOverlay extends StatelessWidget {
  const _CallOverlay({required this.name, required this.onAccept, required this.onDecline});

  final String name;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Positioned.fill(
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF3A0D12), Color(0xFF0E0E0E)],
          ),
        ),
        padding: const EdgeInsets.fromLTRB(24, 56, 24, 48),
        child: Column(
          children: [
            const Text('Panggilan masuk Fix Merah', style: TextStyle(color: Colors.white70, fontSize: 15)),
            const SizedBox(height: 40),
            CircleAvatar(
              radius: 62,
              backgroundColor: kRed,
              child: Text(initial, style: const TextStyle(fontSize: 54, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
            const SizedBox(height: 24),
            Text(
              name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: Colors.white),
            ),
            const SizedBox(height: 8),
            const Text('Berdering...', style: TextStyle(color: Colors.white60, fontSize: 16)),
            const Spacer(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _roundBtn(Icons.call_end, 'Tolak', const Color(0xFFE53935), onDecline),
                _roundBtn(Icons.call, 'Terima', const Color(0xFF2EB85C), onAccept),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _roundBtn(IconData icon, String label, Color color, VoidCallback onTap) {
    return Column(
      children: [
        Material(
          color: color,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: 74, height: 74, child: Icon(icon, color: Colors.white, size: 34)),
          ),
        ),
        const SizedBox(height: 10),
        Text(label, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }
}


// ---------------------------------------------------------------------------
// Video pembuka: menjelaskan fungsi aplikasi dan developer, ada tombol Lewati.
// ---------------------------------------------------------------------------
class _IntroSlide {
  const _IntroSlide(this.icon, this.title, this.lines);
  final IconData icon;
  final String title;
  final List<String> lines;
}

class _IntroScreen extends StatefulWidget {
  const _IntroScreen({super.key, required this.onFinish});
  final VoidCallback onFinish;

  @override
  State<_IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<_IntroScreen> {
  static const List<_IntroSlide> _slides = <_IntroSlide>[
    _IntroSlide(Icons.shield_outlined, 'Fix Merah', ['Bantu ajukan banding WhatsApp dengan cepat dan rapi.']),
    _IntroSlide(Icons.bolt_rounded, 'Fungsi utama', [
      'Kirim banding WhatsApp lewat email Gmail kamu sendiri',
      'Template banding siap pakai',
      'Chat, panggilan, dan notifikasi langsung di aplikasi',
    ]),
    _IntroSlide(Icons.code_rounded, 'Developer', [kDevName, kDevRole]),
  ];
  // Lama tiap teks tampil sebelum ganti ke teks berikutnya.
  static const Duration _slideEvery = Duration(seconds: 5);

  VideoPlayerController? _vc;
  Timer? _slideTimer;
  int _slide = 0;
  bool _muted = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    // Intro tidak berhenti sendiri: video diulang dan teks bergantian
    // sampai tombol Lewati ditekan.
    _slideTimer = Timer.periodic(_slideEvery, (_) {
      if (mounted) setState(() => _slide = (_slide + 1) % _slides.length);
    });
    _start();
  }

  Future<void> _start() async {
    final c = VideoPlayerController.asset('assets/intro.mp4');
    _vc = c;
    try {
      await c.initialize();
      if (!mounted) return;
      await c.setLooping(true);
      await c.play();
      if (mounted) setState(() {});
    } catch (_) {
      // Video gagal diputar: teks tetap tampil di latar gelap.
      _vc = null;
      c.dispose();
    }
  }

  void _finish() {
    if (_done) return;
    _done = true;
    widget.onFinish();
  }

  void _toggleMute() {
    setState(() => _muted = !_muted);
    _vc?.setVolume(_muted ? 0 : 1);
  }

  @override
  void dispose() {
    _slideTimer?.cancel();
    _vc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _vc;
    final ready = c != null && c.value.isInitialized;
    return Positioned.fill(
      child: Material(
        color: Colors.black,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (ready)
              FittedBox(
                fit: BoxFit.cover,
                clipBehavior: Clip.hardEdge,
                child: SizedBox(
                  width: c.value.size.width,
                  height: c.value.size.height,
                  child: VideoPlayer(c),
                ),
              ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x66000000), Color(0x11000000), Color(0xE6000000)],
                  stops: [0, 0.4, 1],
                ),
              ),
            ),
            // Semua teks rata kiri dengan batas kiri yang sama.
            Positioned(
              left: 24,
              right: 24,
              bottom: 48,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 500),
                layoutBuilder: (current, previous) => Stack(
                  alignment: Alignment.bottomLeft,
                  children: <Widget>[...previous, if (current != null) current],
                ),
                child: _slideView(_slides[_slide], ValueKey<int>(_slide)),
              ),
            ),
            Positioned(
              top: 10,
              right: 14,
              child: Row(
                children: [
                  if (ready)
                    IconButton(
                      onPressed: _toggleMute,
                      icon: Icon(_muted ? Icons.volume_off_rounded : Icons.volume_up_rounded, color: Colors.white),
                    ),
                  Material(
                    color: Colors.white24,
                    shape: const StadiumBorder(),
                    child: InkWell(
                      customBorder: const StadiumBorder(),
                      onTap: _finish,
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('Lewati', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                            SizedBox(width: 4),
                            Icon(Icons.skip_next_rounded, color: Colors.white, size: 20),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _slideView(_IntroSlide sl, Key key) {
    return SizedBox(
      key: key,
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(sl.icon, color: kRed, size: 34),
          const SizedBox(height: 10),
          Text(
            sl.title,
            textAlign: TextAlign.left,
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 12),
          for (final line in sl.lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                line,
                textAlign: TextAlign.left,
                style: const TextStyle(fontSize: 17, height: 1.3, color: Colors.white70),
              ),
            ),
        ],
      ),
    );
  }
}
