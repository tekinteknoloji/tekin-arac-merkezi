'use strict';
// Modül kaydı: modules\<id>\ klasörlerini okur ve doğrular.
//  - modul.json varsa o geçerlidir.
//  - modul.json yoksa başlatıcı otomatik algılanır (start.bat, baslat.bat, ilk .bat/.cmd/.exe/.ps1,
//    package.json içindeki "start" betiği, en son HTML dosyası: index.html öncelikli).
//  - Kullanıcı arayüzden bir başlatıcı seçtiyse (data\secimler.json) seçim her zaman önceliklidir.

const fs = require('fs');
const path = require('path');

const TURLER = ['bat', 'ps1', 'exe', 'komut', 'html', 'sayfa'];
// 'sayfa': yerel HTML dosyası; hub tarayıcıda açar (süreç başlatılmaz).
const UZANTI_TUR = { '.bat': 'bat', '.cmd': 'bat', '.exe': 'exe', '.ps1': 'ps1', '.html': 'sayfa', '.htm': 'sayfa' };
const ONCELIKLI_ADLAR = ['start.bat', 'baslat.bat', 'calistir.bat', 'run.bat', 'start.cmd', 'baslat.cmd'];
const ATLANAN_KLASORLER = new Set(['node_modules', '__pycache__', 'dist', 'build', 'release', 'venv', '.venv']);
const ADAY_LIMITI = 200;

// Bir klasörde seçilebilecek başlatıcıları listeler (klasörün kendisi + bir alt düzey).
// Dönen "dosya" değeri, klasöre göre göreli ve "/" ayraçlıdır.
function adaylar(klasor) {
  const sonuc = [];
  const tara = (dizin, onek, derinlik) => {
    let girdiler;
    try {
      girdiler = fs.readdirSync(dizin, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const g of girdiler) {
      if (g.isFile()) {
        const adi = g.name;
        const uzanti = path.extname(adi).toLowerCase();
        if (UZANTI_TUR[uzanti]) {
          sonuc.push({ dosya: onek + adi, tur: UZANTI_TUR[uzanti], komut: null, derinlik });
        } else if (adi.toLowerCase() === 'package.json') {
          try {
            const p = JSON.parse(fs.readFileSync(path.join(dizin, adi), 'utf8').replace(/^﻿/, ''));
            if (p && p.scripts && p.scripts.start) {
              sonuc.push({ dosya: onek + adi, tur: 'komut', komut: 'npm start', derinlik });
            }
          } catch (_) { /* bozuk package.json yok sayılır */ }
        }
      } else if (g.isDirectory() && derinlik === 0) {
        if (/^[_.]/.test(g.name) || ATLANAN_KLASORLER.has(g.name.toLowerCase())) continue;
        tara(path.join(dizin, g.name), `${onek}${g.name}/`, 1);
      }
    }
  };
  tara(klasor, '', 0);

  // Sıra: öncelikli .bat adları, diğer çalıştırılabilirler, index.html, diğer HTML dosyaları.
  const oncelik = (a) => {
    const ad = a.dosya.split('/').pop().toLowerCase();
    const i = ONCELIKLI_ADLAR.indexOf(ad);
    if (i !== -1) return i;
    if (a.tur !== 'sayfa') return ONCELIKLI_ADLAR.length;
    return ONCELIKLI_ADLAR.length + (ad === 'index.html' ? 1 : 2);
  };
  sonuc.sort((a, b) =>
    a.derinlik - b.derinlik ||
    oncelik(a) - oncelik(b) ||
    a.dosya.localeCompare(b.dosya, 'tr'));
  return sonuc.slice(0, ADAY_LIMITI);
}

// Seçilen adayı kayda uygular. Aday listesinde yoksa null döner (yol dışarıdan enjekte edilemez).
function secimUygula(kayit, secim) {
  if (!secim) return null;
  const a = adaylar(kayit.klasor).find((x) => x.dosya === secim);
  if (!a) return null;
  const tam = path.join(kayit.klasor, ...a.dosya.split('/'));
  const sonuc = { ...kayit, tur: a.tur, calisma: path.dirname(tam), secili: a.dosya, hata: null };
  return a.tur === 'komut'
    ? { ...sonuc, komut: a.komut, baslat: null }
    : { ...sonuc, baslat: tam, komut: null };
}

// Tek bir modül klasörünü okur. Hatalı modüller de listede kalır (hata alanıyla),
// böylece kullanıcı neyin eksik olduğunu arayüzde görür.
function oku(modulKlasoru, secim) {
  const id = path.basename(modulKlasoru);
  const taban = {
    id,
    ad: id,
    aciklama: '',
    tur: '',
    klasor: modulKlasoru,
    calisma: null,
    baslat: null,
    komut: null,
    url: null,
    port: null,
    izle: true,
    otomatik: false,
    secili: null,
    hata: null,
  };

  const jsonYolu = path.join(modulKlasoru, 'modul.json');
  const otomatik = !fs.existsSync(jsonYolu);

  let m = {};
  if (!otomatik) {
    try {
      const metin = fs.readFileSync(jsonYolu, 'utf8');
      m = JSON.parse(metin.replace(/^﻿/, ''));
    } catch (e) {
      return { ...taban, hata: 'modul.json okunamadı: ' + e.message };
    }
  }

  const tur = String(m.tur || '').toLowerCase();
  // "klasor" ve "baslat" / "komut" yolları, "klasor" alanına göre çözümlenir.
  // "klasor" yoksa modül klasörü kullanılır. Mutlak yollar da desteklenir.
  const klasor = m.klasor ? path.resolve(modulKlasoru, m.klasor) : modulKlasoru;

  const kayit = {
    ...taban,
    ad: m.ad || id,
    aciklama: m.aciklama || (otomatik ? 'Başlatıcı otomatik algılandı' : ''),
    tur,
    klasor,
    url: m.url || null,
    port: Number.isInteger(m.port) ? m.port : null,
    izle: m.izle !== false,
    otomatik,
  };

  if (!fs.existsSync(klasor)) {
    return { ...kayit, hata: `Klasör bulunamadı: ${klasor}` };
  }

  // Kullanıcının seçtiği başlatıcı her şeyden önceliklidir; hatalı modülü de kurtarır.
  const secilmis = secimUygula(kayit, secim);
  if (secilmis) return secilmis;

  if (otomatik) {
    const ilk = secimUygula(kayit, (adaylar(klasor)[0] || {}).dosya);
    return ilk
      ? { ...ilk, secili: null }
      : { ...kayit, hata: 'Başlatılabilir dosya bulunamadı. "Başlatıcı" ile seçin veya modul.json yazın.' };
  }

  if (!TURLER.includes(tur)) {
    return { ...kayit, hata: `Geçersiz "tur" değeri: "${m.tur ?? ''}"` };
  }

  if (tur === 'html') {
    if (!kayit.url) return { ...kayit, hata: '"html" türü için "url" gerekli' };
    return kayit;
  }

  if (tur === 'komut') {
    if (!m.komut) return { ...kayit, hata: '"komut" alanı eksik' };
    return { ...kayit, komut: String(m.komut) };
  }

  if (!m.baslat) return { ...kayit, hata: '"baslat" alanı eksik' };
  const baslat = path.resolve(klasor, m.baslat);
  if (!fs.existsSync(baslat)) {
    return { ...kayit, baslat, hata: `Dosya bulunamadı: ${baslat}` };
  }
  return { ...kayit, baslat };
}

// Modül kök klasörünü tarar. "_" veya "." ile başlayan klasörler yok sayılır.
// secimler: { <modül id>: "göreli/dosya" } — kullanıcının arayüzden seçtiği başlatıcılar.
function tara(modullerKlasoru, secimler = {}) {
  if (!fs.existsSync(modullerKlasoru)) return [];
  return fs
    .readdirSync(modullerKlasoru, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name))
    .map((d) => oku(path.join(modullerKlasoru, d.name), secimler[d.name]))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

module.exports = { tara, oku, adaylar, TURLER };
