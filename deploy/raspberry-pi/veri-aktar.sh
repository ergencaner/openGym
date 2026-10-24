#!/usr/bin/env bash
# Başka bir bilgisayardaki (ör. Mac) openGym verisini bu Pi'ye taşır. Önce Pi'deki mevcut veri
# yedeklenir, uygulama durdurulur, gelen data/ yerine konur ve uygulama yeniden başlar.
#
#   ~/openGym/deploy/raspberry-pi/veri-aktar.sh ~/mac-data
#
# ~/mac-data, Mac'teki openGym klasöründeki data/ klasörünün kopyasıdır (README.md'deki scp adımı).
set -euo pipefail

KAYNAK="${1:-}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO/deploy/raspberry-pi"
[ -n "$KAYNAK" ] && [ -d "$KAYNAK" ] || { echo "Kullanım: $0 <kopyalanan-data-klasörü>"; exit 2; }
[ -f "$KAYNAK/db.json" ] || { echo "HATA: $KAYNAK içinde db.json yok; doğru klasör mü? (Mac'teki openGym/data)"; exit 1; }
cd "$REPO"

echo "== Pi'deki mevcut veri yedekleniyor"
sudo "$HERE/yedek.sh"
echo "== Uygulama durduruluyor"
sudo docker compose stop
echo "== Veri kopyalanıyor"
sudo mkdir -p data
sudo find data -mindepth 1 -delete
sudo cp -a "$KAYNAK"/. data/
echo "== Uygulama başlatılıyor"
sudo docker compose up -d
echo
echo "Tamam. Yeni adreste 'Şifreyle giriş yap'ı seçip profil adınız ve Mac'te tanımladığınız şifreyle girin."
