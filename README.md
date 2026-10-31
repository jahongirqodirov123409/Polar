# Pingvin Muzeyi v2

3D muzey + 8 ta onlayn o'yin + yozuvli chat + mikrofon (ovozli aloqa). Kutubxona o'rnatish shart emas, kerak: **Node.js 18+**.

## Nima o'zgardi

**Tezlik (ma'lumotlar kech kelishi tuzatildi)**
- Serverda TCP Nagle o'chirildi (kichik xabarlar 40–200 ms kutib qolardi). Mahalliy o'lchov: raqib yurishi **41 ms → 2 ms**.
- Server endi hammaga to'liq ro'yxatni emas, faqat **o'zgarganlarni** yuboradi. O'yin stollarida yangilanish darhol ketadi.
- O'yin yoki Mafiya ochilganda muzey trafigi o'chiriladi (`mute`) va **3D chizish to'xtatiladi** — telefon qizimaydi, o'yin tez ishlaydi.
- Statik fayllar gzip + ETag bilan beriladi (index.html 95 KB → 33 KB), `three.js` endi **loyiha ichida** (`public/three.min.js`), CDN kerak emas.
- Service worker: fayllar telefonda saqlanadi, ilova qayta ochilganda darhol ishga tushadi (offline ham ochiladi). Shriftlar sahifani to'smaydi.
- Ikki marta `join` yuborish va qayta ulanish xatolari tuzatildi, aloqa uzilsa 0.3–3 soniyada qayta ulanadi.

**O'yinlar**
- Raqib bo'lmasa ham o'ynash mumkin: **🤖 Bot bilan** (shaxmat, shashka, Mau-Mau, Durak, X-O, 4 qator, Gugurt, Ruletka) yoki **👥 bitta qurilmada ikki kishi**.
- "Ulanmoqda…" holatida ham tugmalar ko'rinib turadi, o'yin to'xtab qolmaydi.
- Kech kelgan raqibga joriy holat avtomatik yuboriladi; stolda ping (ms) ko'rsatiladi; stolda raqib bilan chat.

**Yangi imkoniyatlar**
- 💬 **Yozuvli chat** (muzeydagi hamma bilan) + personaj tepasida pufak; ism qo'yish mumkin.
- 🎤 **Mikrofon**: muzeyda eng yaqin 4 kishi (masofaga qarab ovoz), o'yin stolida raqib bilan. 🔊/🔇 — ovozni o'chirish. Gapirganda personajning boshi/tumshug'i qimirlaydi.
- 😄 **Harakatlar**: salom, raqs, sakrash, bayram (hamma ko'radi).
- **Animatsiya**: ko'z qisish, atrofga qarash, nafas, boshning harakati, qanot/qo'l silkitish, yugurish, sakrashda soya o'zgarishi — barcha 10 personaj uchun.

## 1. Kompyuterda sinash
```
node server.js
```
`http://localhost:3000`. Ikkinchi o'yinchi uchun boshqa oyna yoki telefon (bir Wi‑Fi: `http://KOMPYUTER_IP:3000`).
Mikrofon brauzerda faqat **https** yoki `localhost` da ishlaydi.

## 2. Serverga joylash
VPS (nginx + pm2), Docker va Cloud Run — avvalgi yo'riqnoma o'zgarmagan:

```
docker build -t pingvin . && docker run -d -p 3000:3000 --restart=always pingvin
```
nginx'da `/ws` uchun `Upgrade` sarlavhalari shart (avvalgi README'dagi blok). Tekshirish: `/healthz`.

**Google Cloud Run** (tez va uzilishsiz bo'lishi uchun bayroqlar muhim):
```
gcloud run deploy pingvin --source . --region REGION --allow-unauthenticated \
  --max-instances 1 --min-instances 1 --no-cpu-throttling --cpu-boost --timeout 3600
```
- `--min-instances 1` — "sovuq start" bo'lmaydi (birinchi ulanish 5–15 soniya kutmaydi).
- `--no-cpu-throttling` — WebSocket xabarlari CPU cheklovisiz ketadi.
- `REGION`: O'zbekistonga yaqinroq hududni tanlang (masalan Yaqin Sharq yoki Hindiston: `me-central1`, `asia-south1`); har 1000 km taxminan 10–15 ms qo'shadi. Hududlar mavjudligini `gcloud run regions list` bilan tekshiring.
- `--max-instances 1` shart (xonalar xotirada).

## 3. APK yaratish (Android)

`android/` papkasida tayyor Android loyiha bor. Fayllar APK ichida (tez ochiladi), faqat onlayn qism sizning serveringizga ulanadi.

**Avval server manzilini yozing** — `public/config.js`:
```js
window.PM_WS = "wss://SIZNING-SERVER/ws";   // Cloud Run: wss://pingvin-xxxx.a.run.app/ws
```
APK'da faqat **wss://** (https server) ishlaydi.

**A) Kompyutersiz — GitHub orqali (eng oson):**
1. Shu papkani yangi GitHub repozitoriyga yuklang.
2. Repozitoriyda *Actions → "APK yig'ish" → Run workflow*. (Yoki server manzilini kodga yozmasdan: *Settings → Variables → `SERVER_WS`* ga `wss://.../ws` kiriting.)
3. 3–6 daqiqadan so'ng *Artifacts → pingvin-muzeyi-apk* ichidan `app-debug.apk` ni yuklab oling va telefonga o'rnating ("noma'lum manbalar"ga ruxsat bering).

**B) Android Studio:** `android/` papkasini oching → *Build → Build APK(s)*. Yoki terminalda: `cd android && ./gradlew assembleDebug` (JDK 17 va Android SDK kerak). Natija: `android/app/build/outputs/apk/debug/app-debug.apk`.

Mikrofon: ilova birinchi marta 🎤 bosilganda Android ruxsat so'raydi.

**APK'siz variant:** Chrome → ⋮ → "Ilovani o'rnatish" (PWA) ham ishlaydi.

## Muhim eslatmalar
- Ovozli aloqa to'g'ridan-to'g'ri (WebRTC) ulanadi. Ba'zi mobil operatorlarda (qat'iy NAT) ulanmasligi mumkin — shunda `config.js` ga o'z TURN serveringizni yozing: `window.PM_TURN={urls:"turn:SERVER:3478",username:"u",credential:"p"};`
- Server xotirada ishlaydi: qayta ishga tushsa, boshlangan o'yinlar va chat tarixi tozalanadi.
- Bitta server ~100–200 bir vaqtdagi mehmonga yetadi (`server.js` boshida `MAXCONN`).
- Mafiya xonasida ovoz yo'q (tunda jim bo'lishi uchun).

## Fayllar
- `server.js` — veb-server, onlayn xonalar, chat, ovoz signali, Mafiya
- `public/index.html` — muzey, 8 o'yin, bot, chat, emotsiya
- `public/net.js` — serverga ulanish; `public/voice.js` — mikrofon (WebRTC)
- `public/config.js` — APK/TURN sozlamalari; `public/sw.js` — tez ochilish keshi
- `android/` — APK loyihasi; `.github/workflows/apk.yml` — bulutda APK yig'ish

## Gorizontal rejim
- Interfeys telefon yotganda (landscape) ixchamlashadi: joystik/tugmalar, chat, o'yin stollari (chapda holat va chat, o'ngda taxta), Mafiya.
- Tik holatda "Telefonni yoting" ekrani chiqadi (o'tkazib yuborish mumkin).
- ⛶ tugmasi to'liq ekranga o'tkazadi va Android'da yotiq holatni qulflaydi. PWA manifest va APK (`sensorLandscape`) ham yotiq.
