# 🎬 SmartCinema - Personal Media Streaming Server

SmartCinema هو تطبيق وسائط متكامل وبث أفلام ومسلسلات (Full-Stack Streaming Platform) يتيح لك إدارة مكتبتك الرقمية، جلب بيانات وتصنيفات TMDb، استخراج الترجمات، البث المباشر بدقة متعددة (HLS)، وتوليد اقتراحات ذكية عبر الذكاء الاصطناعي (AI Recommendations).

---

## 🏗️ هيكلية المشروع (Architecture)

- **الواجهة الأمامية (Frontend):**
  - React 18 + TypeScript + Vite + Tailwind CSS + Radix UI + Lucide Icons.
  - دعم كامل للـ PWA (Progressive Web App).
  - مشغل فيديو مخصص HLS يدعم الترجمات والتنقل والـ Mini-player.
  
- **الخادم وقاعدة البيانات (Backend):**
  - Python Flask RESTful API.
  - قاعدة بيانات SQLite مدمجة وسريعة.
  - تكامل مع FFmpeg لمعالجة الفيديو وتوليد الإطارات (Thumbnails) والتحويل الفوري (HLS Transcoding).
  - دعم الذكاء الاصطناعي عبر Ollama محلياً أو APIs خارجية.

---

## 🚀 التشغيل المحلي السريع (Quick Local Setup)

### 1. المتطلبات المسبقة (Prerequisites)
- [Node.js](https://nodejs.org/) (إصدار 18 أو أحدث)
- [Python](https://www.python.org/) (إصدار 3.10 أو أحدث)
- [FFmpeg](https://ffmpeg.org/) (مثبت ومضاف إلى مسار النظام PATH)

### 2. التثبيت (Installation)

```bash
# 1. تثبيت اعتماديات الواجهة
cd frontend
npm install

# 2. تثبيت اعتماديات الباكيند
cd ../backend
pip install -r requirements.txt
```

### 3. التشغيل (Running)
- **على Windows:** يمكنك النقر مرتين على ملف `start.cmd` لتشغيل السيرفر والواجهة معاً.
- **أو يدوياً:**
  ```bash
  # تشغيل الباكيند (Port 5000)
  cd backend && python app.py

  # تشغيل الواجهة في نافذة أخرى (Port 8080)
  cd frontend && npm run dev
  ```

---

## 🐙 كيفية رفع المشروع على GitHub (Step-by-Step)

المجلد مهيأ بالكامل بملفات `.gitignore` الصحيحة التي تمنع رفع ملفات الـ `node_modules` والـ Cache والملفات المؤقتة.

نفذ الأوامر التالية من داخل المجلد الرئيسي:

```bash
# 1. تهيئة مستودع Git
git init

# 2. إضافة كافة الملفات النظيفة
git add .

# 3. حفظ الـ Commit الأول
git commit -m "Initial commit: SmartCinema clean release"

# 4. تغيير اسم الفرع إلى main
git branch -M main

# 5. ربط المستودع بحسابك على GitHub (استبدل الرابط برابط مستودعك الجديد)
git remote add origin https://github.com/YOUR_USERNAME/smartcinema.git

# 6. رفع الكود
git push -u origin main
```

---

## 🌐 خيارات الاستضافة والنشر (Hosting & Deployment)

### الخيار 1: رفع الواجهة الأمامية (Frontend) على Vercel أو Netlify
1. قم بإنشاء حساب على [Vercel](https://vercel.com) أو [Netlify](https://netlify.com).
2. اربط حسابك بـ GitHub واختر مستودع `smartcinema`.
3. اضبط إعدادات المشروع كالتالي:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. في **Environment Variables**، أضف المتغير:
   - `VITE_API_URL`: ضع رابط السيرفر المرفوع (مثلاً: `https://my-cinema-backend.onrender.com`).
5. اضغط **Deploy**.

> **ملاحظة:** يتوفر أيضاً مجلد `frontend/dist` المبني مسبقاً، يمكنك سحبه وإفلاته مباشرة في Netlify Drop للاستضافة الفورية بدون بناء!

---

### الخيار 2: رفع السيرفر (Backend) على Render أو Railway أو VPS
1. **استخدام Render / Railway:**
   - اربط المستودع واختر مجلد `backend`.
   - حدد الـ Build Command: `pip install -r requirements.txt`
   - حدد الـ Start Command: `python app.py`
   - أو اختر خيار النشر عبر **Dockerfile** الجاهز في مجلد `backend`.
2. **استخدام سيرفر خاص (VPS / Ubuntu):**
   - ثبت Docker و Docker Compose.
   - شغل الأمر: `docker compose up -d`

---

### الخيار 3: تشغيل السيرفر من جهازك الشخصي وربطه بالإنترنت (Recommended for Home Media)
نظراً لأن الأفلام والمسلسلات تشغل مئات الجيجابايت على قرصك الصلب:
1. شغل السيرفر على جهازك في المنزل.
2. استخدم أداة مثل **Cloudflare Tunnel** لتوفير رابط ويب مجاني وآمن (مثال: `https://cinema.yourdomain.com`).
3. اربط واجهة الـ Frontend (المرفوعة على Vercel) برابط السيرفر هذا للاستمتاع بالمشاهدة من أي جهاز في العالم!

---

## ⚙️ متغيرات البيئة (Environment Variables)

### Frontend (`frontend/.env`)
| المتغير | الوصف | القيمة الافتراضية |
|---|---|---|
| `VITE_API_URL` | رابط الـ Backend في بيئة الإنتاج | فارغ (يعتمد على الـ Proxy محلياً) |

### Backend (`backend/.env`)
| المتغير | الوصف | القيمة الافتراضية |
|---|---|---|
| `PORT` | منفذ السيرفر | `5000` |
| `SECRET_KEY` | مفتاح تشفير الجلسات | قيمة افتراضية للتطوير |
| `TMDB_API_KEY` | مفتاح TMDb لجلب ملصقات وتفاصيل الأفلام | اختياري |
| `OLLAMA_HOST` | رابط خادم Ollama للذكاء الاصطناعي | `http://localhost:11434` |
| `CORS_ORIGINS` | النطاقات المسموح لها بالاتصال | `*` |
