# Tekin Araç Merkezi

Tekin Teknoloji BT araçlarını tek bir çatı altında toplayan, tarayıcıdan kontrol edilebilen modüler hub.

- Her araç `modules\<ad>\` klasöründe durur. `modul.json` yazabilirsiniz ama zorunlu değildir: yoksa hub başlatıcıyı otomatik algılar.
- Kartlardaki **Başlatıcı** düğmesiyle hangi dosyanın çalışacağını siz seçebilirsiniz.
- Hub, modülleri web arayüzünden başlatır, durdurur, loglarını gösterir ve çalışıp çalışmadığını izler.
- Yalnızca `127.0.0.1` üzerinde dinler; dışarıya açılmaz.
- Bağımlılık yoktur (yalnızca Node.js 18+).

## Kullanım

1. Node.js 18 veya üzeri kurulu olmalı.
2. `start.bat` dosyasına çift tıklayın. Tarayıcı açılır.
3. Adres çubuğundaki `?t=...` anahtarı oturum anahtarıdır. Anahtar `data\token.txt` içindedir; paylaşmayın.

Port değiştirmek için `HUB_PORT` ortam değişkenini kullanın (varsayılan `7700`). Tarayıcıyı otomatik açmamak için `node hub\server.js --no-open`.

## Yapı

```
AllTools\
  start.bat              Hub'ı başlatır
  package.json           npm start / npm test
  README.md
  hub\
    server.js            HTTP sunucusu, API ve statik dosyalar
    lib\registry.js      modul.json okuma ve doğrulama
    lib\runner.js        Süreç başlatma, durdurma, log, port kontrolü
    public\              Web arayüzü (index.html, app.js)
    test\                Birim testleri
  modules\               Modül tanımları (her biri bir klasör + modul.json)
  data\                  Çalışma verisi (token). Git'e eklenmez.
  old\                   Eski araçlar; taşıma tamamlanınca silinebilir
```

## Başlatıcı algılama ve seçme

Bir klasörde `modul.json` yoksa hub şu sırayla bakar (klasörün kendisi ve bir alt düzeyi taranır; `node_modules`, `dist`, `build`, `release`, `__pycache__` ve `_`/`.` ile başlayan klasörler atlanır):

1. `start.bat`, `baslat.bat`, `calistir.bat`, `run.bat`
2. Diğer `.bat`, `.cmd`, `.exe`, `.ps1` dosyaları (alfabetik)
3. `package.json` içinde `scripts.start` varsa `npm start`
4. HTML dosyaları (`index.html` öncelikli): kartta **Sayfa** rozeti ve **Aç** düğmesi çıkar, sayfa tarayıcıda yeni pencerede açılır. Süreç başlatılmaz.

Algılanan kart **otomatik** rozetiyle görünür. Yanlış dosya seçildiyse veya `modul.json` hatalıysa karttaki **Başlatıcı** düğmesine basıp listeden dosyayı seçin. Seçim `data\secimler.json` içinde saklanır, modül dosyalarına dokunulmaz ve her zaman önceliklidir. **Otomatiğe dön** seçimi siler.

## API

Tüm `/api` istekleri `X-Hub-Token` başlığı ister.

| Yöntem | Yol | İşlev |
|---|---|---|
| GET | `/api/saglik` | Sağlık kontrolü (yetki gerekmez) |
| GET | `/api/moduller` | Modül listesi ve durumları |
| POST | `/api/moduller/:id/baslat` | Modülü başlatır |
| POST | `/api/moduller/:id/durdur` | Hub'ın başlattığı modülü durdurur |
| POST | `/api/moduller/:id/klasor` | Modül klasörünü Explorer'da açar |
| GET | `/api/moduller/:id/adaylar` | Seçilebilecek başlatıcı dosyaları |
| POST | `/api/moduller/:id/baslatici?dosya=...` | Başlatıcıyı kaydeder; `dosya` boşsa seçimi siler |
| GET | `/api/moduller/:id/log?n=200` | Son log satırları |

## Güvenlik notları

- Dinleme adresi `127.0.0.1`'dir. Host başlığı `127.0.0.1` veya `localhost` dışındaysa istek reddedilir (DNS yeniden bağlama koruması).
- Modül yolları istekten alınmaz; yalnızca `modules\` altındaki kayıtlı modül kimlikleri çalıştırılabilir.
- Hub kapanırken hub'ın başlattığı süreç ağaçları sonlandırılır.

## Taşıma durumu

Bu sürümde modül kodları henüz kopyalanmadı. `modules\` altındaki `modul.json` dosyaları kodları eski konumdan (`old\...`) çalıştırır. Kod taşınınca `klasor` yolları `modules\<ad>\` olarak güncellenmelidir.

| Modül | Kaynak | Not |
|---|---|---|
| Robokopya | `old\Robocopy` | Kendi kendini yükseltir; `izle: false`. Port 8080. |
| Ağ Tarayıcı | `old\IT-TOOLS\Ag-Tarayıcı` | Flask. Port bilinmiyor; `port` eklenirse durum izlenir. |
| Olay Paneli | `old\IT-TOOLS\Raporlama-Paneli` | `izle: false`. |
| IT Command Center | `old\IT-Command-Center-Electron - Kopya\eapp` | `npm install` gerekir. İki kopyadan hangisinin güncel olduğu doğrulanmalı. |

`old\IT-TOOLS\IT-TOOLS.ps1` ve `old\Tekin-Arac-Merkezi` (WinForms hub) bu hub ile değiştirilmiştir; yedek olarak tutulabilir.
`old\tools` içindeki Python hafıza betikleri bir araç modülü değil, geliştirme yardımcısıdır; buraya dahil edilmedi.

## Testler

```
npm test
```

## Destek

Tekin Teknoloji · [tekinteknoloji.com](https://tekinteknoloji.com) · Kurumsal BT desteği mi lazım? → tekinteknoloji.com
Ücretsiz ve reklamsız, telemetri yoktur. ❤ Destek ol: [GitHub Sponsors](https://github.com/sponsors/tekinteknoloji)
