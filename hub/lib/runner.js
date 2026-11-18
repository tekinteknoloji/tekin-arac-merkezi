'use strict';
// Modül süreçlerini başlatır, izler, durdurur ve loglarını tutar.

const { spawn, execFile, execFileSync } = require('child_process');
const net = require('net');

const LOG_LIMITI = 500;
const surecler = new Map(); // modul id -> { child, baslangic, log[], sonCikis }

// PowerShell tek tırnak içinde yol kaçışı: ' -> ''
const psKacis = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Modül türüne göre çalıştırılacak komutu üretir.
// cmd tabanlı türlerde tırnaklar elle kurulur ve windowsVerbatimArguments kullanılır,
// çünkü Node'un varsayılan tırnaklaması cmd.exe ile uyumsuzdur.
function komutSatiri(m) {
  switch (m.tur) {
    case 'bat':
      return {
        exe: 'cmd.exe',
        args: ['/d', '/s', '/c', `"chcp 65001>nul & "${m.baslat}""`],
        verbatim: true,
      };
    case 'komut':
      return { exe: 'cmd.exe', args: ['/d', '/s', '/c', `"${m.komut}"`], verbatim: true };
    case 'ps1':
      return {
        exe: 'powershell.exe',
        args: [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & ${psKacis(m.baslat)}`,
        ],
        verbatim: false,
      };
    case 'exe':
      return { exe: m.baslat, args: [], verbatim: false };
    default:
      return null;
  }
}

function logEkle(kayit, satirlar) {
  for (const s of satirlar) {
    if (!s.trim()) continue;
    kayit.log.push(s);
  }
  if (kayit.log.length > LOG_LIMITI) {
    kayit.log.splice(0, kayit.log.length - LOG_LIMITI);
  }
}

function canli(id) {
  const k = surecler.get(id);
  return !!(k && k.child && k.child.exitCode === null && !k.child.killed);
}

function portAcikMi(port, zamanAsimi = 400) {
  return new Promise((resolve) => {
    const soket = net.connect({ host: '127.0.0.1', port, timeout: zamanAsimi });
    const bitir = (sonuc) => {
      soket.destroy();
      resolve(sonuc);
    };
    soket.once('connect', () => bitir(true));
    soket.once('timeout', () => bitir(false));
    soket.once('error', () => bitir(false));
  });
}

function baslat(m) {
  if (m.hata) return { ok: false, mesaj: m.hata };
  if (m.tur === 'html') return { ok: true, mesaj: 'Bağlantı arayüzde açılır.' };
  if (canli(m.id)) return { ok: false, mesaj: 'Modül zaten çalışıyor.' };

  const c = komutSatiri(m);
  if (!c) return { ok: false, mesaj: `Bu tür başlatılamaz: ${m.tur}` };

  // izle=false: GUI veya kendi penceresini açan modüller. Çıktı yakalanmaz,
  // süreç ayrı tutulur ve durum yalnızca port kontrolüyle belirlenir.
  const izle = m.izle;
  let child;
  try {
    child = spawn(c.exe, c.args, {
      cwd: m.calisma || m.klasor,
      windowsHide: true,
      windowsVerbatimArguments: c.verbatim,
      detached: !izle,
      stdio: izle ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    });
  } catch (e) {
    return { ok: false, mesaj: 'Başlatılamadı: ' + e.message };
  }

  if (!izle) {
    child.on('error', () => {});
    child.unref();
    return { ok: true, mesaj: 'Modül ayrı pencerede başlatıldı.' };
  }

  const kayit = { child, baslangic: new Date(), log: [], sonCikis: null };
  surecler.set(m.id, kayit);
  logEkle(kayit, [`[hub] Başlatıldı: ${c.exe} ${c.args.join(' ')}`]);

  const satirla = (veri) => logEkle(kayit, String(veri).split(/\r?\n/));
  child.stdout.on('data', satirla);
  child.stderr.on('data', satirla);
  child.on('error', (e) => logEkle(kayit, [`[hub] Hata: ${e.message}`]));
  child.on('exit', (kod) => {
    kayit.sonCikis = kod;
    logEkle(kayit, [`[hub] Süreç sona erdi (kod: ${kod})`]);
  });

  return { ok: true, mesaj: 'Modül başlatıldı.' };
}

function durdur(m) {
  if (!canli(m.id)) {
    return {
      ok: false,
      mesaj: 'Bu modül hub tarafından izlenmiyor. Açık pencereyi kendiniz kapatın.',
    };
  }
  const { child } = surecler.get(m.id);
  return new Promise((resolve) => {
    // /T: alt süreçleri de sonlandırır (ör. npm -> electron)
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], (err) => {
      resolve({
        ok: !err,
        mesaj: err ? 'Durdurulamadı: ' + err.message : 'Modül durduruldu.',
      });
    });
  });
}

async function durum(m) {
  const k = surecler.get(m.id);
  const izlenen = canli(m.id);
  const portAcik = m.port ? await portAcikMi(m.port) : false;
  return {
    calisiyor: izlenen || portAcik,
    izlenen,
    portAcik,
    pid: izlenen ? k.child.pid : null,
    baslangic: k && k.baslangic ? k.baslangic.toISOString() : null,
    sonCikis: k ? k.sonCikis : null,
  };
}

function logOku(id, n = 200) {
  const k = surecler.get(id);
  return k ? k.log.slice(-n) : [];
}

// Hub kapanırken izlenen süreç ağaçlarını öldürür.
function hepsiniKapat() {
  for (const [id, k] of surecler) {
    if (canli(id)) {
      try {
        execFileSync('taskkill', ['/PID', String(k.child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch (_) {
        /* süreç zaten kapanmış olabilir */
      }
    }
  }
}

module.exports = { baslat, durdur, durum, logOku, hepsiniKapat, komutSatiri, portAcikMi };
