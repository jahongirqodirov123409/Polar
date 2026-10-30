# Pingvin Muzeyi — serverga joylash

Kutubxona o'rnatish shart emas. Kerak: **Node.js 18 yoki yangi**.

## 1. Kompyuterda sinash
```
node server.js
```
Brauzerda `http://localhost:3000` oching. Ikkinchi o'yinchi uchun boshqa oyna yoki telefon oching (bir xil Wi‑Fi bo'lsa `http://KOMPYUTER_IP:3000`).

## 2. VPS (Ubuntu) da doimiy ishlatish
```
sudo apt install -y nodejs npm nginx
sudo npm i -g pm2
cd /var/www/pingvin && PORT=3000 pm2 start server.js --name pingvin && pm2 save && pm2 startup
```
Nginx (`/etc/nginx/sites-available/pingvin`), `ws` uchun Upgrade sarlavhalari shart:
```
server {
  server_name SIZNING-DOMEN.uz;
  location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
  location / { proxy_pass http://127.0.0.1:3000; }
}
```
So'ng HTTPS: `sudo certbot --nginx -d SIZNING-DOMEN.uz` (sayt https bo'lsa ulanish avtomatik `wss://` bo'ladi).

## 3. Docker
```
docker build -t pingvin . && docker run -d -p 3000:3000 --restart=always pingvin
```
Render, Railway, Fly.io kabi xizmatlarda ham shu papkani yuklash yetarli (start buyrug'i: `node server.js`, port `PORT` o'zgaruvchisidan olinadi; WebSocket qo'llab-quvvatlanadi).

## Eslatmalar
- Sahifa 3D kutubxonani (three.js) `cdnjs.cloudflare.com` dan, shriftni Google Fonts dan yuklaydi — foydalanuvchilarda internet bo'lishi kerak.
- Server xotirada ishlaydi: qayta ishga tushsa, boshlangan o'yinlar tugaydi.
- Bitta server taxminan 100–200 bir vaqtdagi mehmonga yetadi (cheklov: 500 ulanish, `server.js` boshida `MAXCONN`).
- Tekshirish manzili: `/healthz`.

## Fayllar
- `server.js` — veb-server + onlayn xonalar
- `public/index.html` — muzey va 8 ta o'yin
- `public/net.js` — brauzerning serverga ulanishi

## Google Cloud Run + APK
```
gcloud run deploy pingvin --source . --region europe-west1 --allow-unauthenticated --max-instances 1 --timeout 3600
```
`--max-instances 1` shart (xonalar xotirada, ikkala o'yinchi bitta nusxada bo'lishi kerak). Chiqqan `https://...run.app` manzilini pwabuilder.com ga kiriting → Android → APK. APK'siz ham: Chrome ⋮ → "Ilovani o'rnatish".
