'use strict';
// Tekin Araç Merkezi — tarayıcı tarafı. Bağımlılık yok.

const $ = (id) => document.getElementById(id);
let TOKEN = null;
let moduller = [];
let logModulId = null;
let logZamanlayici = null;

// Anahtar (?t=) adres çubuğundan alınır, oturum boyunca sessionStorage'da tutulur
// ve adresten silinir.
(function anahtarAl() {
  const url = new URL(location.href);
  const t = url.searchParams.get('t');
  if (t) {
    sessionStorage.setItem('hubToken', t);
    url.searchParams.delete('t');
    history.replaceState(null, '', url.pathname);
  }
  TOKEN = sessionStorage.getItem('hubToken');
})();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function bildir(metin, sure = 3000) {
  const b = $('bildirim');
  b.textContent = metin;
  b.style.display = 'block';
  clearTimeout(bildir._t);
  bildir._t = setTimeout(() => (b.style.display = 'none'), sure);
}

async function api(yol, opts = {}) {
  const r = await fetch(yol, {
    ...opts,
    headers: { 'X-Hub-Token': TOKEN || '', ...(opts.headers || {}) },
  });
  let veri = null;
  try { veri = await r.json(); } catch (_) { /* boş yanıt */ }
  if (r.status === 401) {
    bildir('Yetkisiz. Hub konsolundaki adresi (?t=...) kullanın.', 6000);
  }
  return { ok: r.ok, durum: r.status, veri: veri || {} };
}

function durumEtiketi(m) {
  if (m.hata) return ['hata', 'Hatalı'];
  if (m.tur === 'sayfa') return ['izlenmiyor', 'Sayfa'];
  const d = m.durum || {};
  if (d.izlenen) return ['calisiyor', 'Çalışıyor'];
  if (d.portAcik) return ['izlenmiyor', 'Çalışıyor (dış)'];
  return ['durdu', 'Durdu'];
}

function kartCiz(m) {
  const [sinif, metin] = durumEtiketi(m);
  const d = m.durum || {};
  const izlenmiyor = !m.izle;
  const bagli = m.url || (m.port ? `http://localhost:${m.port}/` : null);

  const baslatAdi = m.secili || (m.baslat ? m.baslat.split(/[\\/]/).pop() : '');
  const kaynak = m.tur === 'komut' ? (m.secili ? m.secili + ' → ' : '') + m.komut : baslatAdi || m.url || '';
  const kokRozet = m.secili ? '<span class="rozet secili">seçili</span>'
    : m.otomatik && !m.hata ? '<span class="rozet otomatik">otomatik</span>' : '';
  const hataKutusu = m.hata ? `<div class="meta hata">${esc(m.hata)}</div>` : '';

  const butonlar = [];
  if (m.tur === 'html') {
    butonlar.push(`<button class="birincil" data-eylem="ac" data-url="${esc(m.url)}">Aç</button>`);
  } else if (m.tur === 'sayfa') {
    butonlar.push(`<button class="birincil" data-eylem="baslat" ${m.hata ? 'disabled' : ''}>Aç</button>`);
  } else {
    butonlar.push(`<button class="birincil" data-eylem="baslat" ${m.hata || d.calisiyor ? 'disabled' : ''}>Başlat</button>`);
    butonlar.push(`<button class="tehlike" data-eylem="durdur" ${!d.izlenen ? 'disabled' : ''}>Durdur</button>`);
  }
  if (bagli) butonlar.push(`<button data-eylem="ac" data-url="${esc(bagli)}" ${d.portAcik || m.url ? '' : 'disabled'}>Arayüzü aç</button>`);
  if (m.tur !== 'html') {
    butonlar.push(`<button data-eylem="baslatici" title="Hangi dosyanın başlatılacağını seç">Başlatıcı</button>`);
    if (m.tur !== 'sayfa') butonlar.push(`<button data-eylem="log">Loglar</button>`);
    butonlar.push(`<button data-eylem="klasor">Klasör</button>`);
  }

  const not = izlenmiyor && m.tur !== 'html'
    ? '<div class="aciklama">Ayrı pencerede açılır; durumu port kontrolüyle izlenir.</div>' : '';

  return `
    <section class="kart" data-id="${esc(m.id)}">
      <h2>${esc(m.ad)} <span class="rozet ${sinif}">${metin}</span> ${kokRozet}</h2>
      <div class="aciklama">${esc(m.aciklama)}</div>
      ${not}
      ${hataKutusu}
      <div class="meta">${esc(kaynak)}${m.port ? ' · port ' + m.port : ''}${d.pid ? ' · pid ' + d.pid : ''}</div>
      <div class="butonlar">${butonlar.join('')}</div>
    </section>`;
}

function listeCiz() {
  const filtre = $('ara').value.trim().toLocaleLowerCase('tr');
  const goster = moduller.filter((m) =>
    !filtre || (m.ad + ' ' + m.aciklama + ' ' + m.id).toLocaleLowerCase('tr').includes(filtre));
  $('sayac').textContent = `${goster.length} / ${moduller.length} modül`;
  $('liste').innerHTML = goster.length
    ? goster.map(kartCiz).join('')
    : '<div class="bos">Eşleşen modül yok. modules\\ klasörüne modül ekleyin.</div>';
}

async function yukle() {
  const r = await api('/api/moduller');
  if (r.ok) { moduller = r.veri; listeCiz(); }
}

async function eylem(id, tip) {
  const yol = `/api/moduller/${encodeURIComponent(id)}/${tip}`;
  const r = await api(yol, { method: 'POST' });
  bildir(r.veri.mesaj || (r.ok ? 'Tamam' : 'Hata'));
  await yukle();
}

function logAc(id) {
  logModulId = id;
  const m = moduller.find((x) => x.id === id);
  $('logBaslik').textContent = (m ? m.ad : id) + ' — loglar';
  $('log').style.display = 'flex';
  logYenile();
  clearInterval(logZamanlayici);
  logZamanlayici = setInterval(logYenile, 2000);
}

function logKapat() {
  logModulId = null;
  clearInterval(logZamanlayici);
  $('log').style.display = 'none';
}

async function logYenile() {
  if (!logModulId) return;
  const r = await api(`/api/moduller/${encodeURIComponent(logModulId)}/log?n=300`);
  if (!r.ok) return;
  const pre = $('logIcerik');
  const altta = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
  pre.textContent = r.veri.satirlar.length ? r.veri.satirlar.join('\n') : '(henüz çıktı yok)';
  if (altta) pre.scrollTop = pre.scrollHeight;
}

// ---- Başlatıcı seçimi ----------------------------------------------------
let secimModulId = null;

async function secimAc(id) {
  const m = moduller.find((x) => x.id === id);
  const r = await api(`/api/moduller/${encodeURIComponent(id)}/adaylar`);
  if (!r.ok) { bildir('Adaylar okunamadı.'); return; }
  secimModulId = id;
  $('secimBaslik').textContent = (m ? m.ad : id) + ' — başlatıcı seç';
  const liste = r.veri.adaylar || [];
  const gecerli = r.veri.secili;
  $('secimIcerik').innerHTML = liste.length
    ? liste.map((a) => `
        <label>
          <input type="radio" name="baslatici" value="${esc(a.dosya)}" ${a.dosya === gecerli ? 'checked' : ''}>
          <span>${esc(a.dosya)} <span class="meta">(${a.tur === 'komut' ? 'npm start' : esc(a.tur)})</span></span>
        </label>`).join('')
    : '<div class="bos">Bu klasörde başlatılabilir dosya (.bat, .cmd, .exe, .ps1 veya package.json) yok.</div>';
  $('secim').style.display = 'flex';
}

function secimKapat() {
  secimModulId = null;
  $('secim').style.display = 'none';
}

async function secimKaydet(temizle) {
  if (!secimModulId) return;
  let dosya = '';
  if (!temizle) {
    const secili = document.querySelector('#secimIcerik input[name="baslatici"]:checked');
    if (!secili) { bildir('Bir dosya seçin.'); return; }
    dosya = secili.value;
  }
  const yol = `/api/moduller/${encodeURIComponent(secimModulId)}/baslatici?dosya=${encodeURIComponent(dosya)}`;
  const r = await api(yol, { method: 'POST' });
  bildir(r.veri.mesaj || (r.ok ? 'Tamam' : 'Hata'));
  if (r.ok) { secimKapat(); await yukle(); }
}

$('secimKaydet').addEventListener('click', () => secimKaydet(false));
$('secimTemizle').addEventListener('click', () => secimKaydet(true));
$('secimKapat').addEventListener('click', secimKapat);

// Olay yönetimi: tek bir delegasyon noktası
$('liste').addEventListener('click', async (e) => {
  const buton = e.target.closest('button[data-eylem]');
  if (!buton || buton.disabled) return;
  const id = buton.closest('.kart').dataset.id;
  const tip = buton.dataset.eylem;

  if (tip === 'ac') {
    const url = buton.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
  } else if (tip === 'log') {
    logAc(id);
  } else if (tip === 'baslatici') {
    await secimAc(id);
  } else if (tip === 'klasor') {
    await eylem(id, 'klasor');
  } else if (tip === 'baslat' || tip === 'durdur') {
    buton.disabled = true;
    await eylem(id, tip);
  }
});

$('ara').addEventListener('input', listeCiz);
$('yenile').addEventListener('click', yukle);
$('logKapat').addEventListener('click', logKapat);

yukle();
setInterval(yukle, 4000);
