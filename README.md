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
Canlı adres: https://ahmetsancaktutan-ceo--aytekinsancaktutan-91874-c235e.europe-west4.hosted.app

**Otomatik yayın:** backend bu deponun `main` dalına bağlıdır. `main`'e yapılan her push
birkaç dakika içinde siteyi otomatik günceller. Projedeki diğer backend'ler etkilenmez.

Elle yayın gerekirse (yalnızca bu backend'i hedefler):

```bash
firebase deploy --only apphosting:ahmetsancaktutan-ceo --project aytekinsancaktutan-91874-c235e
```
