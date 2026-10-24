#!/usr/bin/env bash
# openGym verisinin yedeği: data/ klasörü (profiller, passkey'ler, antrenmanlar, öğünler, oturum
# anahtarı) ve .env, tarihli bir .tar.gz olarak. Son YEDEK_GUN günü tutulur (varsayılan 14).
#
#   sudo ~/openGym/deploy/raspberry-pi/yedek.sh
#
# Yedekler varsayılan olarak <kullanıcı klasörü>/opengym-yedek altına yazılır. Bir USB belleğe
# yazmak için:   YEDEK_DIZINI=/media/usb/opengym-yedek sudo ./yedek.sh
# (gece işinde de kullanmak için /etc/cron.d/opengym satırının başına YEDEK_DIZINI=... ekleyin)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SAHIBI="$(stat -c %U "$REPO")"
EV="$(getent passwd "$SAHIBI" | cut -d: -f6)"
HEDEF="${YEDEK_DIZINI:-$EV/opengym-yedek}"
GUN="${YEDEK_GUN:-14}"

[ "$(id -u)" -eq 0 ] || exec sudo -E "$0" "$@"
[ -d "$REPO/data" ] || { echo "Yedeklenecek data/ klasörü yok: $REPO/data"; exit 0; }

mkdir -p "$HEDEF"
DOSYA="$HEDEF/opengym-$(date +%F_%H%M).tar.gz"
# Uygulama her yazışı geçici dosyaya yazıp yerine taşıdığı (atomik) için çalışırken alınan
# kopya da tutarlıdır; sağlık kontrolünün geçici dosyaları dışarıda bırakılır.
PARCALAR=(data); [ -f "$REPO/.env" ] && PARCALAR+=(.env)
tar -czf "$DOSYA" -C "$REPO" --exclude='data/.health-*' --exclude='data/*.tmp' "${PARCALAR[@]}"
chmod 600 "$DOSYA"
chown "$SAHIBI": "$HEDEF" "$DOSYA"
find "$HEDEF" -maxdepth 1 -name 'opengym-*.tar.gz' -mtime +"$GUN" -delete
echo "$(date '+%F %T') yedek: $DOSYA ($(du -h "$DOSYA" | cut -f1))"
