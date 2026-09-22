# 🎵 ATune - Offline PWA Music Player

Aplikasi Web Progresif (**PWA**) pemutar musik offline yang di-host di **GitHub Pages**, dengan sumber lagu tersimpan di **Google Drive** dan diputar 100% offline menggunakan database internal browser (**IndexedDB**).

---

## 🏛️ Arsitektur Sistem

| Komponen | Layanan / Teknologi | Fungsi |
| :--- | :--- | :--- |
| **Web Hosting** | **GitHub Pages** (via GitHub Actions) | Meng-onlinekan website aplikasi secara gratis, aman, dan 24/7. |
| **Lokasi File Lagu** | **Google Drive** | Menyimpan seluruh koleksi file audio MP3/FLAC ([Folder Google Drive Utama](https://drive.google.com/drive/folders/1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU?usp=sharing)). |
| **Penyimpanan Pemutar**| **IndexedDB (Lokal HP/PC)** | Menyimpan file audio utuh (Blob) & cover art di memori perangkat agar bisa diputar tanpa kuota internet kapan saja. |
| **Framework & UI** | **Vite + Tailwind CSS v3** | Performa kilat, antarmuka modern *dark glassmorphism*, hemat daya. |

---

## 🚀 Cara Upload & Hosting ke GitHub Pages

Aplikasi sudah dilengkapi file workflow otomatis di [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml).

### Langkah-langkah Push ke GitHub:

1. **Inisialisasi git & commit:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Aura Music Player PWA"
   git branch -M main
   ```

2. **Hubungkan ke repository GitHub Anda:**
   ```bash
   git remote add origin https://github.com/<USERNAME-ANDA>/<NAMA-REPO>.git
   git push -u origin main
   ```

3. **Aktifkan GitHub Pages:**
   - Masuk ke repository di browser GitHub.
   - Buka menu **Settings** → **Pages**.
   - Pada bagian **Build and deployment > Source**, pilih **GitHub Actions**.
   - Selesai! Dalam beberapa detik website PWA Anda akan live di `https://<USERNAME-ANDA>.github.io/<NAMA-REPO>/`.

---

## 📁 Mengisi Lagu dari Google Drive

1. Buka folder Google Drive Anda: [Folder Google Drive](https://drive.google.com/drive/folders/1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU?usp=sharing).
2. Klik kanan file lagu MP3 yang ada di Google Drive -> pilih **Share / Bagikan** -> pastikan akses diatur ke **"Anyone with the link can view" (Siapa saja yang memiliki link dapat melihat)**.
3. Salin link tersebut.
4. Buka aplikasi Aura Music -> buka menu **Wishlist** atau klik **Tambah Lagu** -> tempel link tersebut:
   - Jika perangkat Anda sedang terhubung ke internet, lagu otomatis langsung diunduh ke database offline.
   - Jika sedang offline, lagu akan tersimpan di **Wishlist**, dan akan **otomatis ter-download sendiri begitu ada koneksi internet!**

---

## 📻 Fitur Unggulan

- **Pemutar MP3 (Deck DAP-X1):** Desain retro-modern pemutar MP3 dengan layar LCD, vinyl berputar, tombol -10s/+10s, dan visualizer spektrum real-time.
- **Wishlist & Auto-Download:** Antrean otomatis untuk link lagu yang diunduh saat terhubung internet.
- **Equalizer 5-Band:** Dilengkapi preset Bass Boost, Treble, Vocal, Rock, Pop, dan EDM.
- **Sleep Timer:** Pengatur waktu tidur otomatis (15m, 30m, 45m, 60m) dengan fade-out suara.
- **PWA Installable:** Dapat diinstal di Android, iOS, Windows, dan Mac.
