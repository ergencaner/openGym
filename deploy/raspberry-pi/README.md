# openGym'i Raspberry Pi'de çalıştırmak

Evdeki bir Raspberry Pi'de 7/24 çalışan, ev dışından da telefon ve iPad'den güvenle erişilen bir
openGym kurulumu. Ev dışından erişim için **Tailscale** kullanılır: Pi'ye `https://homeserver.xxxx.ts.net`
gibi gerçek sertifikalı bir adres verir. Bu adrese sadece sizin cihazlarınız erişebilir, modemde
port açmanız gerekmez.

- **İmajlar:** Pi'de derleme yapılmaz. GitHub Actions forkunuz için hazır imajlar üretir
  (`ghcr.io/<kullanıcı>/opengym-api` ve `opengym-web`), Pi bunları indirir. Pi 3'ün 1 GB belleği
  derlemeye yetmez ama çalıştırmaya yeter.
- **Gereken:** Raspberry Pi 3, 4 ya da 5 ve **64-bit** Raspberry Pi OS (Lite yeterli).

| Dosya | Ne yapar |
|---|---|
| `kurulum.sh` | Docker'ı, Tailscale'i, `.env` ayarlarını, uygulamayı, HTTPS'i ve gece yedeğini kurar |
| `guncelle.sh` | Yedek alır, yeni imajları indirir, uygulamayı yeniden başlatır |
| `yedek.sh` | `data/` ve `.env` dosyalarının tarihli yedeğini alır, son 14 günü tutar |
| `veri-aktar.sh` | Başka bir bilgisayardaki (ör. Mac) veriyi Pi'ye taşır |

---

## 1. GitHub hazırlığı (bir kerelik)

1. **Actions'ı açın.** Forkunuzda **Actions** sekmesine girip *"I understand my workflows, go ahead
   and enable them"* düğmesine basın.
2. **İmajları üretin.** `main`'e yapılan her birleştirme imajları kendiliğinden üretir. Elle başlatmak
   için: Actions → **Publish Docker images** → **Run workflow** → `main`. İlk çalışma 15–25 dakika
   sürebilir; Pi için olan arm64 imajı GitHub'da emülasyonla derlenir.
3. **Paketleri herkese açık yapın.** İş akışı bitince `github.com/<kullanıcınız>?tab=packages`
   adresine gidin. **opengym-api** paketini açın → **Package settings** → *Change visibility* →
   **Public**. Aynısını **opengym-web** için de yapın.
   İmajlarda kişisel veri yoktur, sadece uygulamanın kodu vardır. Verileriniz Pi'deki `data/`
   klasöründe durur.

## 2. Tailscale hesabı (bir kerelik)

1. tailscale.com'da ücretsiz bir hesap açın (Google, Apple ya da GitHub ile).
2. Yönetim panelinde **DNS** sayfasına girin
   (login.tailscale.com/admin/dns):
   - **MagicDNS** açık olmalı (yeni hesaplarda varsayılan olarak açıktır).
   - **HTTPS Certificates** → **Enable HTTPS**.
3. Telefona ve iPad'e **Tailscale** uygulamasını kurup aynı hesapla giriş yapın.

## 3. Pi'ye kurulum

Mac'ten Pi'ye bağlanın:

```bash
ssh caner@homeserver.local
```

Pi'de şunları çalıştırın:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/ergencaner/openGym.git ~/openGym
cd ~/openGym
./deploy/raspberry-pi/kurulum.sh
```

Kurulum sırasında:

- **Tailscale girişi:** Betik ekrana bir giriş bağlantısı yazar. Bağlantıyı telefonda ya da Mac'te
  açıp onaylayın. Betik onayı bekler ve kendiliğinden devam eder.
- **HTTPS onayı:** HTTPS daha önce açılmadıysa `tailscale serve` adımında ikinci bir onay bağlantısı
  çıkabilir.
- **Sonuç:** Betik bitince uygulamanın adresini yazar: `https://homeserver.xxxx.ts.net`.

Gece otomatik güncelleme de istiyorsanız betiği şu şekilde çalıştırın:

```bash
./deploy/raspberry-pi/kurulum.sh --otomatik-guncelleme
```

Pi her gece 04:15'te yeni imaj var mı diye bakar.

Betik tekrar çalıştırılabilir. Bir adımda hata alırsanız sorunu giderip yeniden çalıştırın; tamamlanmış
adımları atlar.

## 4. Verileri Mac'ten taşıma

Mac'teki passkey'iniz `localhost` adresine bağlı olduğu için yeni adreste çalışmaz. Bu yüzden önce
profilinize bir **şifre** ekleyeceğiz, sonra veriyi taşıyacağız.

**Mac'te** (openGym klasörünüzde):

1. `.env` dosyasına şu satırı ekleyin:
   ```
   PASSWORD_LOGIN=1
   ```
2. Uygulamayı bu ayarla yeniden başlatın:
   ```bash
   docker compose up -d --force-recreate
   ```
3. http://localhost:8080 → **Ayarlar → Hesap → Şifre** yolundan bir şifre belirleyin. Passkey onayı
   ister; Mac'te çalışır. **Profil adınızı ve şifreyi not edin.**
4. Uygulamayı durdurup verinin son halini Pi'ye kopyalayın:
   ```bash
   docker compose stop
   scp -r data caner@homeserver.local:~/mac-data
   ```

**Pi'de:**

```bash
~/openGym/deploy/raspberry-pi/veri-aktar.sh ~/mac-data
```

Betik önce Pi'deki mevcut veriyi yedekler, sonra Mac'ten gelen veriyi yerine koyar ve uygulamayı
yeniden başlatır.

## 5. Telefon ve iPad

1. Tailscale uygulamasının **bağlı** olduğundan emin olun.
2. Safari'de (iPad) ya da Chrome'da (Android) `https://homeserver.xxxx.ts.net` adresini açın.
3. **Şifreyle giriş yap**'ı seçip profil adınızı ve şifrenizi girin.
4. Uygulamayı ana ekrana ekleyin:
   - **iPad (Safari):** Paylaş → **Ana Ekrana Ekle**
   - **Android (Chrome):** ⋮ menüsü → **Ana ekrana ekle** (ya da **Uygulamayı yükle**)
5. İsterseniz **Ayarlar → Hesap → Geçiş anahtarı ekle** ile yeni adres için bir passkey de oluşturun.
   Sonraki girişler parmak izi ya da Face ID ile olur.

Bütün cihazlar aynı veriyi görür; birinde girdiğiniz öğün diğerinde de belirir.

## 6. Güncelleme

Yeni bir özellik `main`'e birleştirildiğinde GitHub imajları birkaç dakikada yeniden üretir. Sonra:

```bash
# Evdeyken ya da ev dışında (Mac'te Tailscale açıkken):
ssh caner@homeserver '~/openGym/deploy/raspberry-pi/guncelle.sh'
```

`--otomatik-guncelleme` ile kurduysanız bunu her gece Pi kendisi yapar. Kayıtlar
`/var/log/opengym-guncelle.log` dosyasına yazılır.

## 7. Yedekler

- **Ne zaman:** Her gece 03:30'da ve her güncellemeden önce.
- **Nereye:** `~/opengym-yedek/opengym-YYYY-MM-DD_SSDD.tar.gz` dosyalarına. Son 14 gün tutulur.
- **Elle yedek almak için:**
  ```bash
  sudo ~/openGym/deploy/raspberry-pi/yedek.sh
  ```
- **USB belleğe yazmak için:** `YEDEK_DIZINI=/media/usb/opengym-yedek sudo ./yedek.sh`
- **Mac'e kopyalamak için** (Mac'te):
  ```bash
  scp 'caner@homeserver:~/opengym-yedek/*' ~/Desktop/
  ```

**Geri yüklemek** için (Pi'de):

```bash
cd ~/openGym && sudo docker compose stop
sudo tar -xzf ~/opengym-yedek/opengym-2026-10-24_0330.tar.gz -C ~/openGym
sudo docker compose up -d
```

## 8. Sorun giderme

| Belirti | Çözüm |
|---|---|
| `kurulum.sh`: "64-bit değil" | Karta **Raspberry Pi OS Lite (64-bit)** yazın. `uname -m` komutu `aarch64` göstermeli. |
| "İmajlar indirilemedi" | Actions'ın açık olduğunu ve *Publish Docker images* iş akışının bittiğini kontrol edin. Paketlerin **Public** olduğundan emin olun (1. bölüm). |
| Adres telefonda açılmıyor | Telefonda Tailscale bağlı mı? Pi'de `tailscale status` ve `tailscale serve status` çıktılarına bakın. |
| "Tailscale adı alınamadı" | Yönetim panelinde MagicDNS'i açıp betiği yeniden çalıştırın. |
| Giriş yapılamıyor | Mac'te şifre tanımladınız mı (4. bölüm)? Giriş ekranında **Şifreyle giriş yap**'ı seçip profil adınızı yazın. |
| Uygulama yanıt vermiyor | `cd ~/openGym && sudo docker compose logs --tail 50` |
| Pi yavaş ya da kendiliğinden kapanıyor | 5V 2,5A (Pi 3) güç adaptörü kullanın. `vcgencmd get_throttled` çıktısı `0x0` olmalı. |

## 9. Aynı Pi'de başka uygulamalar

openGym yalnızca Pi'nin kendisine açık bir portta (`127.0.0.1:8080`) çalışır. Dışarıya Tailscale
sunar. Başka bir uygulamayı da aynı adresten ayrı bir HTTPS portuyla açabilirsiniz:

```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3001   # → https://homeserver.xxxx.ts.net:8443
tailscale serve status
```

Pi 3'ün 1 GB belleği openGym'in yanında hafif birkaç uygulamaya yeter (Pi-hole, Uptime Kuma gibi).

> **Önemli:** Passkey'ler cihaz adına bağlıdır. Kurulumdan sonra Pi'nin adını (hostname) ya da
> Tailscale'deki makine adını değiştirmeyin. Değiştirirseniz `.env` içindeki `RP_ID` ve `ORIGIN`'i
> güncelleyin ve şifreyle giriş yapın.
