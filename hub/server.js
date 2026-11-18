'use strict';
// Tekin Araç Merkezi — web kontrol paneli (hub).
// Yalnızca 127.0.0.1 üzerinde dinler. Bağımlılık yoktur (yalnızca Node.js 18+).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const registry = require('./lib/registry');
const runner = require('./lib/runner');

const KOK = path.resolve(__dirname, '..');
const MODULLER = path.join(KOK, 'modules');
const PUBLIC = path.join(__dirname, 'public');
const VERI = path.join(KOK, 'data');
const PORT = Number(process.env.HUB_PORT) || 7700;
const HOST = '127.0.0.1';

fs.mkdirSync(VERI, { recursive: true });

// Erişim anahtarı: data\token.txt içinde saklanır, ilk çalıştırmada üretilir.
const TOKEN_YOLU = path.join(VERI, 'token.txt');
const TOKEN = fs.existsSync(TOKEN_YOLU)
  ? fs.readFileSync(TOKEN_YOLU, 'utf8').trim()
  : (() => {
      const t = crypto.randomBytes(24).toString('hex');
      fs.writeFileSync(TOKEN_YOLU, t, 'utf8');
      return t;
    })();

// Kullanıcının arayüzden seçtiği başlatıcılar: { <modül id>: "göreli/dosya" }.
// Modül dosyalarına dokunulmaz; seçim yalnızca data\secimler.json içinde saklanır.
const SECIM_YOLU = path.join(VERI, 'secimler.json');

function secimOku() {
  try {
    const v = JSON.parse(fs.readFileSync(SECIM_YOLU, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (_) {
    return {};
  }
}

function secimYaz(secimler) {
  const gecici = SECIM_YOLU + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(secimler, null, 2), 'utf8');
  fs.renameSync(gecici, SECIM_YOLU);
}

const IZINLI_HOSTLER = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, kod, veri) {
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(veri));
}

// Sabit zamanlı karşılaştırma: anahtar sızıntısına karşı.
function tokenGecerli(gelen) {
  if (typeof gelen !== 'string') return false;
  const a = Buffer.from(gelen);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function modulBul(id) {
  return registry.tara(MODULLER, secimOku()).find((m) => m.id === id) || null;
}

async function modulListesi() {
  const liste = registry.tara(MODULLER, secimOku());
  return Promise.all(
    liste.map(async (m) => ({ ...m, durum: await runner.durum(m) }))
  );
}

function statik(res, istekYolu) {
  const temiz = istekYolu === '/' ? '/index.html' : istekYolu;
  const dosya = path.normalize(path.join(PUBLIC, temiz));
  if (!dosya.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(dosya, (err, veri) => {
    if (err) {
      res.writeHead(404);
      return res.end('Bulunamadı');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(dosya)] || 'application/octet-stream' });
    res.end(veri);
  });
}

function govdeOku(req) {
  return new Promise((resolve) => {
    let v = '';
    req.on('data', (p) => {
      v += p;
      if (v.length > 10_000) req.destroy();
    });
    req.on('end', () => resolve(v));
    req.on('error', () => resolve(''));
  });
}

async function api(req, res, url) {
  const yol = url.pathname;
  const parcalar = yol.split('/').filter(Boolean); // ['api', 'moduller', id, eylem]

  if (yol === '/api/saglik') return json(res, 200, { ok: true, surum: '2.0.0' });

  if (yol === '/api/moduller' && req.method === 'GET') {
    return json(res, 200, await modulListesi());
  }

  if (parcalar[0] === 'api' && parcalar[1] === 'moduller' && parcalar[2]) {
    const id = decodeURIComponent(parcalar[2]);
    const eylem = parcalar[3];
    const m = modulBul(id); // yol bileşeni dosya yoluna dönüşmez; yalnızca kayıtlı id kabul edilir
    if (!m) return json(res, 404, { ok: false, mesaj: 'Modül bulunamadı.' });

    if (req.method === 'POST' && eylem === 'baslat' && m.tur === 'sayfa') {
      // Yerel HTML dosyası: süreç başlatılmaz, tarayıcıda yeni pencerede açılır.
      if (m.hata || !m.baslat) return json(res, 400, { ok: false, mesaj: m.hata || 'Dosya yok.' });
      tarayiciAc(pathToFileURL(m.baslat).href);
      return json(res, 200, { ok: true, mesaj: 'Sayfa tarayıcıda açıldı.' });
    }
    if (req.method === 'POST' && eylem === 'baslat') {
      const sonuc = runner.baslat(m);
      return json(res, sonuc.ok ? 200 : 400, sonuc);
    }
    if (req.method === 'POST' && eylem === 'durdur') {
      const sonuc = await runner.durdur(m);
      return json(res, sonuc.ok ? 200 : 400, sonuc);
    }
    if (req.method === 'POST' && eylem === 'klasor') {
      spawn('explorer.exe', [m.klasor], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && eylem === 'adaylar') {
      return json(res, 200, {
        adaylar: registry.adaylar(m.klasor).map(({ dosya, tur }) => ({ dosya, tur })),
        secili: m.secili,
        otomatik: m.otomatik,
      });
    }
    if (req.method === 'POST' && eylem === 'baslatici') {
      // dosya boşsa seçim temizlenir (otomatiğe/modul.json'a dönülür).
      const dosya = url.searchParams.get('dosya') || '';
      const secimler = secimOku();
      if (!dosya) {
        delete secimler[m.id];
      } else if (registry.adaylar(m.klasor).some((a) => a.dosya === dosya)) {
        secimler[m.id] = dosya;
      } else {
        return json(res, 400, { ok: false, mesaj: 'Bu dosya başlatıcı adayı değil.' });
      }
      secimYaz(secimler);
      return json(res, 200, { ok: true, mesaj: dosya ? 'Başlatıcı kaydedildi.' : 'Seçim temizlendi.' });
    }
    if (req.method === 'GET' && eylem === 'log') {
      const n = Math.min(Number(url.searchParams.get('n')) || 200, 500);
      return json(res, 200, { satirlar: runner.logOku(m.id, n) });
    }
  }

  return json(res, 404, { ok: false, mesaj: 'Bilinmeyen istek.' });
}

const sunucu = http.createServer(async (req, res) => {
  // DNS yeniden bağlama saldırılarına karşı Host kontrolü
  if (!IZINLI_HOSTLER.has(req.headers.host || '')) {
    res.writeHead(403);
    return res.end('Geçersiz istek');
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    if (!tokenGecerli(req.headers['x-hub-token'])) {
      return json(res, 401, { ok: false, mesaj: 'Yetkisiz. Adresteki ?t= anahtarını kontrol edin.' });
    }
    if (req.method === 'POST') await govdeOku(req); // gövde kullanılmıyor; bağlantıyı temiz kapat
    try {
      return await api(req, res, url);
    } catch (e) {
      return json(res, 500, { ok: false, mesaj: 'Sunucu hatası: ' + e.message });
    }
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end();
  }
  return statik(res, url.pathname);
});

// Tarayıcıyı yeni pencerede açar. Sıra: HUB_BROWSER ortam değişkeni, Chrome, Edge, varsayılan tarayıcı.
// Hangi yöntemin kullanıldığı ve hata olursa nedeni konsola yazılır.
function tarayiciAc(adres) {
  const varsayilan = () => {
    console.log('Tarayıcı: varsayılan tarayıcı açılıyor (cmd start).');
    const c = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${adres}"`], {
      windowsVerbatimArguments: true, windowsHide: true, detached: true, stdio: 'ignore',
    });
    c.on('error', (e) => console.log('Tarayıcı açılamadı: ' + e.message + '\nAdresi elle kopyalayıp tarayıcıya yapıştırın.'));
    c.on('exit', (kod) => { if (kod) console.log('Varsayılan tarayıcı komutu hata kodu verdi: ' + kod); });
    c.unref();
  };

  const kokler = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const adaylar = [];
  if (process.env.HUB_BROWSER) adaylar.push(process.env.HUB_BROWSER);
  for (const k of kokler) adaylar.push(path.join(k, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  for (const k of kokler) adaylar.push(path.join(k, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  const exe = adaylar.find((p) => fs.existsSync(p));

  if (!exe) return varsayilan();
  console.log('Tarayıcı: ' + exe + ' --new-window');
  const c = spawn(exe, ['--new-window', adres], { detached: true, stdio: 'ignore' });
  c.on('error', (e) => {
    console.log('Tarayıcı başlatılamadı (' + e.message + '). Varsayılan tarayıcıya geçiliyor.');
    varsayilan();
  });
  c.unref();
}

sunucu.listen(PORT, HOST, () => {
  const adres = `http://${HOST}:${PORT}/?t=${TOKEN}`;
  console.log('Tekin Araç Merkezi (hub) çalışıyor.');
  console.log('Adres: ' + adres);
  console.log('Modül klasörü: ' + MODULLER);
  if (!process.argv.includes('--no-open')) {
    tarayiciAc(adres);
  }
});

sunucu.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE'
    ? `Port ${PORT} kullanımda. HUB_PORT ile farklı bir port seçin.`
    : e.message);
  process.exit(1);
});

function kapat() {
  runner.hepsiniKapat();
  process.exit(0);
}
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);
