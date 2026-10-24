#!/usr/bin/env bash
# openGym'i bir Raspberry Pi'ye kurar: Docker, Tailscale (HTTPS ile ev dışından erişim), uygulama,
# gece yedeği ve isteğe bağlı otomatik güncelleme. Rehber: deploy/raspberry-pi/README.md
#
#   cd ~/openGym && ./deploy/raspberry-pi/kurulum.sh [--otomatik-guncelleme]
#
# Uygulama Pi'de derlenmez: GitHub Actions'ın forkunuz için ürettiği hazır imajlar indirilir
# (ghcr.io/<github-kullanıcınız>/opengym-api ve opengym-web). Pi 3'ün 1 GB belleği derlemeye
# yetmez ama çalıştırmaya fazlasıyla yeter. Betik tekrar çalıştırılabilir; her seferinde
# eksik olanı tamamlar.
set -euo pipefail

OTO=0
for a in "$@"; do
  case "$a" in
    --otomatik-guncelleme) OTO=1 ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) echo "Bilinmeyen seçenek: $a" >&2; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO/deploy/raspberry-pi"
KULLANICI="$(id -un)"
PORT_YEREL=8080

adim() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
uyari() { printf '\033[1;33m!   %s\033[0m\n' "$*"; }
hata() { printf '\033[1;31mHATA: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || hata "Betiği sudo olmadan, kendi kullanıcınızla çalıştırın (gerektiğinde şifre sorar)."
[ "$(uname -m)" = "aarch64" ] || hata "Bu sistem 64-bit değil ($(uname -m)). Karta 'Raspberry Pi OS Lite (64-bit)' yazın."
[ -f "$REPO/docker-compose.yml" ] || hata "openGym klasörü bulunamadı: $REPO"

# ---------------------------------------------------------------- temel paketler
adim "Temel paketler (git, curl)"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates >/dev/null

# ---------------------------------------------------------------- swap
# 1 GB bellekli bir Pi'de Docker'ın imaj açarken nefes alabilmesi için en az ~1 GB swap.
adim "Swap alanı"
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "${SWAP_MB:-0}" -ge 900 ]; then
  echo "Swap zaten yeterli: ${SWAP_MB} MB"
elif command -v dphys-swapfile >/dev/null 2>&1; then
  sudo sed -i -E 's/^#?CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
  sudo dphys-swapfile setup >/dev/null && sudo dphys-swapfile swapon
  echo "Swap 1024 MB yapıldı."
elif systemctl list-unit-files 2>/dev/null | grep -q '^rpi-swap'; then
  echo "Sistem kendi swap yönetimini kullanıyor (rpi-swap): ${SWAP_MB} MB. Dokunulmadı."
elif [ ! -f /swapfile ]; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "1 GB /swapfile oluşturuldu."
fi

# ---------------------------------------------------------------- Docker
adim "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
if ! id -nG "$KULLANICI" | grep -qw docker; then
  sudo usermod -aG docker "$KULLANICI"
  echo "$KULLANICI docker grubuna eklendi (sudo'suz 'docker' için bir sonraki girişte geçerli)."
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || true
DOCKER="sudo docker"
docker compose version >/dev/null 2>&1 || $DOCKER compose version >/dev/null 2>&1 || hata "docker compose bulunamadı."
echo "$($DOCKER --version)"

# ---------------------------------------------------------------- Tailscale
adim "Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sudo sh
fi
sudo systemctl enable --now tailscaled >/dev/null 2>&1 || true
ts_json() { sudo tailscale status --json 2>/dev/null || true; }
ts_state() { ts_json | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("BackendState",""))
except Exception: print("")'; }
if [ "$(ts_state)" != "Running" ]; then
  echo "Tailscale'e giriş gerekiyor. Aşağıdaki bağlantıyı telefonda ya da Mac'te açıp onaylayın;"
  echo "betik onayı bekleyip kendiliğinden devam eder."
  sudo tailscale up
fi
sudo tailscale set --operator="$KULLANICI" >/dev/null 2>&1 || true
TS_AD=$(ts_json | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))
except Exception: print("")')
[ -n "$TS_AD" ] && [[ "$TS_AD" == *.ts.net ]] || hata "Tailscale adı alınamadı. Yönetim panelinde (login.tailscale.com/admin/dns) MagicDNS'in açık olduğundan emin olun ve betiği tekrar çalıştırın."
echo "Tailscale adresi: https://$TS_AD"

# ---------------------------------------------------------------- .env
adim "Ayar dosyası (.env)"
cd "$REPO"
[ -f .env ] || cp .env.example .env
set_env() {
  local k="$1" v="$2"
  if grep -qE "^#? *$k=" .env; then sed -i -E "0,/^#? *$k=.*/s||$k=$v|" .env
  else printf '%s=%s\n' "$k" "$v" >> .env; fi
}
# Hangi GitHub hesabının imajları: bu klasörün geldiği fork (OPENGYM_SAHIP ile değiştirilebilir).
SAHIP="${OPENGYM_SAHIP:-$(git -C "$REPO" remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]([^/]+)/.*$#\1#' | tr '[:upper:]' '[:lower:]')}"
[ -n "$SAHIP" ] || hata "GitHub kullanıcı adı bulunamadı. OPENGYM_SAHIP=kullaniciadi ./deploy/raspberry-pi/kurulum.sh ile verin."
ETIKET="${OPENGYM_ETIKET:-edge}"
set_env RP_ID "$TS_AD"
set_env ORIGIN "https://$TS_AD"
# Yalnızca Pi'nin kendisine açık: dışarıya Tailscale'in HTTPS'i sunar, ev ağına düz http açılmaz.
set_env WEB_PORT "127.0.0.1:$PORT_YEREL"
set_env PASSWORD_LOGIN 1
set_env DEFAULT_LANG tr
set_env OPENGYM_API_IMAGE "ghcr.io/$SAHIP/opengym-api:$ETIKET"
set_env OPENGYM_WEB_IMAGE "ghcr.io/$SAHIP/opengym-web:$ETIKET"
chmod 600 .env
grep -E '^(RP_ID|ORIGIN|WEB_PORT|PASSWORD_LOGIN|OPENGYM_API_IMAGE|OPENGYM_WEB_IMAGE)=' .env

# ---------------------------------------------------------------- uygulama
adim "İmajları indirme ve başlatma"
if ! $DOCKER compose pull; then
  uyari "İmajlar indirilemedi. Muhtemel sebepler:"
  uyari "  1) GitHub'da forkunuzun Actions sekmesi açık değil ya da 'Publish Docker images' henüz bitmedi."
  uyari "  2) Paketler gizli: github.com/$SAHIP?tab=packages → opengym-api ve opengym-web →"
  uyari "     Package settings → Change visibility → Public."
  hata "Bunları düzeltip betiği tekrar çalıştırın."
fi
$DOCKER compose up -d
printf 'Uygulamanın açılması bekleniyor'
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT_YEREL/api/health" >/dev/null 2>&1; then echo ' tamam.'; break; fi
  printf '.'; sleep 2
  [ "$i" -lt 60 ] || { echo; hata "Uygulama yanıt vermedi. Kayıtlar: sudo docker compose logs --tail 50"; }
done

# ---------------------------------------------------------------- HTTPS
adim "HTTPS (tailscale serve)"
echo "Tailscale'de HTTPS sertifikaları kapalıysa bir bağlantı gösterilir; açıp onaylayın."
sudo tailscale serve --bg "http://127.0.0.1:$PORT_YEREL"

# ---------------------------------------------------------------- zamanlanmış işler
adim "Gece yedeği$( [ $OTO = 1 ] && echo ' ve otomatik güncelleme')"
chmod +x "$HERE"/*.sh
{
  echo "# openGym (deploy/raspberry-pi/kurulum.sh). Saatler Pi'nin saat diliminde."
  echo "SHELL=/bin/bash"
  echo "30 3 * * * root $HERE/yedek.sh >> /var/log/opengym-yedek.log 2>&1"
  [ $OTO = 1 ] && echo "15 4 * * * root $HERE/guncelle.sh >> /var/log/opengym-guncelle.log 2>&1"
} | sudo tee /etc/cron.d/opengym >/dev/null
sudo chmod 644 /etc/cron.d/opengym
cat /etc/cron.d/opengym | grep -v '^#'

adim "Hazır"
cat <<EOF

  Adres:   https://$TS_AD

  Telefonda ve iPad'de Tailscale uygulamasına aynı hesapla girin, bu adresi açın,
  ardından tarayıcının paylaş menüsünden "Ana Ekrana Ekle" deyin.

  Mac'teki verilerinizi taşımak için:   README.md → "Verileri Mac'ten taşıma"
  Güncellemek için:                     $HERE/guncelle.sh
  Elle yedek:                           sudo $HERE/yedek.sh

EOF
