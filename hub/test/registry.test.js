'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tara, adaylar } = require('../lib/registry');

function gecici() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hub-test-'));
}

function modul(kok, ad, icerik) {
  const d = path.join(kok, ad);
  fs.mkdirSync(d, { recursive: true });
  if (icerik !== undefined) fs.writeFileSync(path.join(d, 'modul.json'), icerik, 'utf8');
  return d;
}

function dosya(d, ad, icerik = '') {
  const tam = path.join(d, ad);
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik, 'utf8');
  return tam;
}

test('geçerli bat modülü okunur', () => {
  const kok = gecici();
  const d = modul(kok, 'a', JSON.stringify({ ad: 'A', tur: 'bat', baslat: 'x.bat' }));
  fs.writeFileSync(path.join(d, 'x.bat'), '@echo off');
  const [m] = tara(kok);
  assert.equal(m.id, 'a');
  assert.equal(m.hata, null);
  assert.equal(m.baslat, path.join(d, 'x.bat'));
});

test('bozuk JSON hata alanıyla listelenir, çökmez', () => {
  const kok = gecici();
  modul(kok, 'bozuk', '{ bu json değil');
  const [m] = tara(kok);
  assert.match(m.hata, /okunamadı/);
});

test('geçersiz tur ve eksik baslat hata verir', () => {
  const kok = gecici();
  modul(kok, 'b', JSON.stringify({ tur: 'python', baslat: 'x' }));
  modul(kok, 'c', JSON.stringify({ tur: 'bat' }));
  const liste = tara(kok);
  assert.match(liste.find((m) => m.id === 'b').hata, /Geçersiz/);
  assert.match(liste.find((m) => m.id === 'c').hata, /baslat/);
});

test('_ ve . ile başlayan klasörler yok sayılır', () => {
  const kok = gecici();
  modul(kok, '_arsiv', JSON.stringify({ tur: 'komut', komut: 'dir' }));
  modul(kok, '.gizli', JSON.stringify({ tur: 'komut', komut: 'dir' }));
  assert.equal(tara(kok).length, 0);
});

test('komut modülü klasor alanına göre çözümlenir', () => {
  const kok = gecici();
  const modulDir = modul(kok, 'k', JSON.stringify({ tur: 'komut', komut: 'npm start', klasor: 'hedef' }));
  const alt = path.join(modulDir, 'hedef');
  fs.mkdirSync(alt);
  const [m] = tara(kok);
  assert.equal(m.hata, null);
  assert.equal(m.klasor, alt);
  assert.equal(m.komut, 'npm start');
});

// ---- otomatik algılama ------------------------------------------------------

test('modul.json yoksa start.bat otomatik seçilir (build_portable.bat değil)', () => {
  const kok = gecici();
  const d = modul(kok, 'oto');
  dosya(d, 'build_portable.bat');
  dosya(d, 'start.bat');
  const [m] = tara(kok);
  assert.equal(m.hata, null);
  assert.equal(m.otomatik, true);
  assert.equal(m.secili, null);
  assert.equal(m.tur, 'bat');
  assert.equal(m.baslat, path.join(d, 'start.bat'));
});

test('öncelikli ad yoksa ilk dosya alfabetik seçilir', () => {
  const kok = gecici();
  const d = modul(kok, 'oto');
  dosya(d, 'b.ps1');
  dosya(d, 'a.ps1');
  const [m] = tara(kok);
  assert.equal(m.tur, 'ps1');
  assert.equal(m.baslat, path.join(d, 'a.ps1'));
});

test('package.json start betiği npm start olarak algılanır, alt klasörde de bulunur', () => {
  const kok = gecici();
  const d = modul(kok, 'elec');
  dosya(d, 'eapp/package.json', JSON.stringify({ scripts: { start: 'electron .' } }));
  dosya(d, 'eapp/node_modules/x/run.bat');
  const [m] = tara(kok);
  assert.equal(m.hata, null);
  assert.equal(m.tur, 'komut');
  assert.equal(m.komut, 'npm start');
  assert.equal(m.calisma, path.join(d, 'eapp'));
});

test('başlatılabilir dosya yoksa anlaşılır hata verir', () => {
  const kok = gecici();
  const d = modul(kok, 'bos');
  dosya(d, 'notlar.txt');
  const [m] = tara(kok);
  assert.match(m.hata, /Başlatılabilir dosya bulunamadı/);
});

test('node_modules, dist ve gizli klasörler aday sayılmaz', () => {
  const kok = gecici();
  const d = modul(kok, 'x');
  dosya(d, 'node_modules/p/a.bat');
  dosya(d, 'dist/b.bat');
  dosya(d, '_eski/c.bat');
  dosya(d, 'ana.bat');
  assert.deepEqual(adaylar(d).map((a) => a.dosya), ['ana.bat']);
});

// ---- kullanıcı seçimi ------------------------------------------------------

test('kullanıcı seçimi otomatik algılamayı ezer', () => {
  const kok = gecici();
  const d = modul(kok, 'oto');
  dosya(d, 'start.bat');
  dosya(d, 'araclar/ozel.ps1');
  const [m] = tara(kok, { oto: 'araclar/ozel.ps1' });
  assert.equal(m.secili, 'araclar/ozel.ps1');
  assert.equal(m.tur, 'ps1');
  assert.equal(m.baslat, path.join(d, 'araclar', 'ozel.ps1'));
  assert.equal(m.calisma, path.join(d, 'araclar'));
});

test('kullanıcı seçimi modul.json hatasını kurtarır', () => {
  const kok = gecici();
  const d = modul(kok, 'k', JSON.stringify({ tur: 'bat', baslat: 'yok.bat' }));
  dosya(d, 'gercek.bat');
  assert.match(tara(kok)[0].hata, /Dosya bulunamadı/);
  const [m] = tara(kok, { k: 'gercek.bat' });
  assert.equal(m.hata, null);
  assert.equal(m.baslat, path.join(d, 'gercek.bat'));
});

test('modul.json varsa ve seçim yoksa modul.json geçerli kalır', () => {
  const kok = gecici();
  const d = modul(kok, 'j', JSON.stringify({ tur: 'bat', baslat: 'a.bat' }));
  dosya(d, 'a.bat');
  dosya(d, 'start.bat');
  const [m] = tara(kok);
  assert.equal(m.otomatik, false);
  assert.equal(m.baslat, path.join(d, 'a.bat'));
});

test('aday listesinde olmayan seçim (yol enjeksiyonu) yok sayılır', () => {
  const kok = gecici();
  const d = modul(kok, 'oto');
  dosya(d, 'start.bat');
  dosya(kok, 'disarida.bat');
  for (const kotu of ['../disarida.bat', '..\\disarida.bat', 'C:/Windows/System32/cmd.exe', 'olmayan.bat']) {
    const [m] = tara(kok, { oto: kotu });
    assert.equal(m.secili, null, kotu);
    assert.equal(m.baslat, path.join(d, 'start.bat'), kotu);
  }
});

// ---- HTML sayfaları ---------------------------------------------------------

test('yalnızca HTML içeren klasör sayfa olarak algılanır, index.html öncelikli', () => {
  const kok = gecici();
  const d = modul(kok, 'site');
  dosya(d, 'hakkinda.html');
  dosya(d, 'index.html');
  const [m] = tara(kok);
  assert.equal(m.hata, null);
  assert.equal(m.tur, 'sayfa');
  assert.equal(m.baslat, path.join(d, 'index.html'));
});

test('çalıştırılabilir dosya varsa HTML dosyasına tercih edilir', () => {
  const kok = gecici();
  const d = modul(kok, 'karma');
  dosya(d, 'index.html');
  dosya(d, 'zeta.bat');
  const [m] = tara(kok);
  assert.equal(m.tur, 'bat');
  assert.equal(m.baslat, path.join(d, 'zeta.bat'));
});

test('kullanıcı HTML dosyasını başlatıcı olarak seçebilir', () => {
  const kok = gecici();
  const d = modul(kok, 'karma');
  dosya(d, 'start.bat');
  dosya(d, 'panel.html');
  const [m] = tara(kok, { karma: 'panel.html' });
  assert.equal(m.tur, 'sayfa');
  assert.equal(m.secili, 'panel.html');
});

test('modul.json içinde tur "sayfa" kabul edilir', () => {
  const kok = gecici();
  const d = modul(kok, 'p', JSON.stringify({ tur: 'sayfa', baslat: 'rapor.html' }));
  dosya(d, 'rapor.html');
  const [m] = tara(kok);
  assert.equal(m.hata, null);
  assert.equal(m.baslat, path.join(d, 'rapor.html'));
});
