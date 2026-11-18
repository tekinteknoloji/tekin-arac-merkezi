# Modüller

Her araç bu klasörde kendi alt klasöründe durur. Hub bu klasörü tarar; yeni modül eklemek için klasörü buraya atmak yeterlidir, hub kodunda değişiklik gerekmez. `modul.json` yoksa başlatıcı otomatik algılanır (`start.bat` öncelikli); yanlışsa kartta **Başlatıcı** düğmesiyle siz seçersiniz. `modul.json` yalnızca ad, açıklama, port gibi ayarlar için gerekir.

## modul.json alanları

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `ad` | hayır | Listede görünen ad. Yoksa klasör adı kullanılır. |
| `aciklama` | hayır | Kısa açıklama. |
| `tur` | evet | `bat`, `ps1`, `exe`, `komut` veya `html`. |
| `baslat` | `html` ve `komut` dışında evet | Çalıştırılacak dosya. `klasor`'a göre çözümlenir. |
| `komut` | yalnızca `komut` türünde | Örn. `npm start`. `klasor` içinde çalışır. |
| `url` | yalnızca `html` türünde | Açılacak adres. Ayrıca çalışan modüller için "Arayüzü aç" bağlantısı olarak da kullanılabilir. |
| `klasor` | hayır | Çalışma klasörü. Mutlak yol veya modül klasörüne göre göreli yol olabilir. Yoksa modül klasörü kullanılır. |
| `port` | hayır | Modülün dinlediği yerel port. Hub bu portu kontrol ederek durumu gösterir. |
| `izle` | hayır | `false` ise süreç yakalanmaz ve ayrı pencerede çalışır (GUI'ler, kendi penceresini açan betikler). Varsayılan `true`. |

## Örnek

```json
{
  "ad": "Örnek Araç",
  "aciklama": "Kısa açıklama",
  "tur": "ps1",
  "klasor": "D:\\Claude\\AllTools\\old\\OrnekArac",
  "baslat": "calistir.ps1",
  "port": 9000
}
```

## Kurallar

- `_` veya `.` ile başlayan klasörler yok sayılır (arşiv, geçici klasörler için kullanılabilir).
- Hatalı modüller listede gri-kırmızı rozetle görünür; hata metni kartın içinde yazar.
- Hub modül dosyalarını değiştirmez; yalnızca okur ve çalıştırır.
