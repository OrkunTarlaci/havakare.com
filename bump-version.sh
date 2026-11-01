#!/bin/sh
# Her deploy'dan önce çalıştır:  sh bump-version.sh
# Tüm css/js/glb adreslerindeki ?v=... değerini yeniler; böylece tarayıcılar
# F5'te bile eski dosyaları kullanmaz (Ctrl+F5 gerekmez).
V=$(date +%Y%m%d-%H%M)
sed -i -E "s/\?v=[0-9]{8}-[0-9A-Za-z]+/?v=$V/g" index.html js/droneModel.js
# index.html'deki önden yükleme betiği (var V = '...') ve servis worker sürümü
sed -i -E "s/V = '[0-9]{8}-[0-9A-Za-z]+'/V = '$V'/" index.html
sed -i -E "s/VERSION = .[0-9]{8}-[0-9A-Za-z]+./VERSION = '$V'/" sw.js
echo "Yeni sürüm: $V"
