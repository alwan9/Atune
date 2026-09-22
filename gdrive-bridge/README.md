# Panduan Integrasi Auto-Upload Google Drive (Hardened Security Edition)

Skrip ini menghubungkan aplikasi **Aura Music Player PWA** langsung dengan Folder Google Drive Anda dengan proteksi keamanan berlapis tanpa perlu user login:
👉 **Target Folder:** `1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU`

---

## 🛡️ Lapisan Keamanan yang Sudah Terpasang:

1. **Token Signature Otomatis (`AURA_APP_TOKEN`):**
   - Aplikasi PWA menyertakan token autentikasi rahasia secara otomatis di latar belakang.
   - Bot, hacker, atau crawler luar yang mencoba menembak URL endpoint Google Apps Script tanpa token aplikasi **langsung ditolak (401 Unauthorized)**.
   - Pengguna asli tetap **tidak perlu login / bebas hambatan**.

2. **Rate Limiting & Anti-Spam (DoS Quota Protection):**
   - Dibatasi maksimal 15 request per 5 menit per klien menggunakan Google Apps Script `CacheService`.
   - Menangkal serangan *flooding / denial of service* yang ingin menghabiskan kuota Google Drive Anda.

3. **MIME-Type Whitelist Ketat & Anti-Malware:**
   - Hanya menerima file audio sah (`audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/flac`, `audio/webm`).
   - Mencegah hacker menyelundupkan file berbahaya (seperti `.exe`, `.html`, `.js`, `.php`, `.sh`).

4. **Ukuran File Maksimal (Size Guard):**
   - Dibatasi maksimal **35 MB per file** untuk menjaga efisiensi memori dan ruang penyimpanan Google Drive.

5. **Sanitasi Nama File & Anti-Path Traversal:**
   - Membersihkan null bytes (`\0`) dan direktori traversal (`../`) agar struktur folder Drive tetap aman dan bersih.

---

## ⚡ Langkah Mudah Pemasangan (Hanya 1 Kali):

1. **Buka Google Apps Script:**
   - Kunjungi [script.google.com](https://script.google.com) lalu klik tombol **"Project Baru"** (New Project).

2. **Paste Kode:**
   - Copy-paste seluruh isi file [`Code.gs`](./Code.gs).
   - Klik icon **Simpan** (Ctrl+S / Cmd+S).

3. **Deploy sebagai Web App:**
   - Klik tombol biru **"Terapkan" / "Deploy"** di kanan atas -> pilih **"Deployment Baru" (New deployment)**.
   - Klik icon gerigi ⚙️ di sebelah *Pilih jenis* -> pilih **"Aplikasi Web" (Web app)**.
   - Konfigurasi:
     - **Deskripsi:** `Aura Music Secure Webhook`
     - **Jalankan sebagai (Execute as):** `Saya (email Anda)`
     - **Yang memiliki akses (Who has access):** `Siapa saja (Anyone)` *(Aman karena dilindungi token signature & rate limiting)*
   - Klik **Deploy** dan berikan izin akses Google Drive saat diminta.

4. **Salin URL Web App ke Aplikasi:**
   - Salin URL Web App yang dihasilkan (`https://script.google.com/macros/s/.../exec`).
   - Buka aplikasi **Aura Music** -> menu **Pengaturan** -> tempel di kolom **"URL Web App (script.google.com)"** -> klik **Simpan**.

Selesai! Sistem kini terlindungi dari serangan hacker, tanpa membebani pengguna dengan login.
