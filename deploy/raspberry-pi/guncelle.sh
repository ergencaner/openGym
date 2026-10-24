#!/usr/bin/env bash
# openGym'i günceller: kurulum dosyalarını GitHub'dan çeker, yeni imajları indirir ve uygulamayı
# yeniden başlatır. Önce bir yedek alır. Pi'de derleme yapılmaz, birkaç dakikada biter.
#
#   ~/openGym/deploy/raspberry-pi/guncelle.sh
#
# Ev dışından: Mac'ten Tailscale üzerinden   ssh <kullanici>@homeserver '~/openGym/deploy/raspberry-pi/guncelle.sh'
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO/deploy/raspberry-pi"
SAHIBI="$(stat -c %U "$REPO")"
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
cd "$REPO"

echo "== $(date '+%F %T') güncelleme başlıyor"
$SUDO "$HERE/yedek.sh"

# Betikler ve docker-compose.yml de değişmiş olabilir. Git, klasörün sahibi olarak çalışır,
# yoksa root olarak çekilen dosyalar kullanıcının klasörüne root sahipliğinde yazılırdı.
if [ "$(id -un)" = "$SAHIBI" ]; then git pull --ff-only --quiet
else $SUDO -u "$SAHIBI" git -C "$REPO" pull --ff-only --quiet; fi

ONCE=$($SUDO docker compose images -q 2>/dev/null | sort | tr '\n' ' ')
$SUDO docker compose pull --quiet
$SUDO docker compose up -d --remove-orphans
SONRA=$($SUDO docker compose images -q 2>/dev/null | sort | tr '\n' ' ')
$SUDO docker image prune -f >/dev/null

PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2 | sed 's/.*://')"
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null 2>&1; then
    [ "$ONCE" = "$SONRA" ] && echo "Zaten güncel; uygulama çalışıyor." || echo "Güncellendi; uygulama çalışıyor."
    exit 0
  fi
  sleep 2
done
echo "UYARI: uygulama yanıt vermiyor. Kayıtlar: sudo docker compose logs --tail 50" >&2
exit 1
