# Ahmet Sancaktutan — Kişisel Site

FETSAN Grup Kurucu Ortağı ve Yönetim Kurulu Başkanı Ahmet Sancaktutan için kişisel site.

## Yapı

- `site/` — yayınlanan site (`index.html`, `css/`, `js/`, `img/`, `media/`, `vendor/`, `brand/`)
- `site/src/` — kaynak şablon ve derleme betiği (yayında dışarıya kapalı)
  - `index.src.html` — içerik burada düzenlenir
  - `build.py` — şablondan `site/index.html` üretir (responsive `<picture>` etiketleri, AST galerisi, proje kartları)
- `server.js` — bağımlılıksız Node sunucusu (önbellek, gzip/brotli, video byte-range)
- `apphosting.yaml`, `firebase.json` — Firebase App Hosting ayarları

## İçerik güncelleme

```bash
python site/src/build.py
```

## Yerelde çalıştırma

```bash
npm start
```

Ardından http://localhost:8080 adresini açın.

## Yayın (Firebase App Hosting)

Backend: `ahmetsancaktutan-ceo` (proje `aytekinsancaktutan-91874-c235e`, bölge `europe-west4`).
Yalnızca bu backend'e dağıtım yapılır; projedeki diğer backend'ler etkilenmez.

```bash
firebase deploy --only apphosting:ahmetsancaktutan-ceo --project aytekinsancaktutan-91874-c235e
```
