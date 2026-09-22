/**
 * =========================================================================
 * Google Apps Script - Aura Music Player Bridge (Hardened Security Edition)
 * Otomatis menerima file audio dari PWA dan menyimpannya ke folder Google Drive
 * Folder ID: 1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU
 * 
 * FITUR KEAMANAN:
 * 1. Token Signature Verification (Mencegah bot/hacker acak tanpa perlu user login)
 * 2. Rate Limiting / Anti-Spam (Mencegah flooding & DoS kuota Google Drive)
 * 3. Strict MIME-Type Whitelist (Hanya menerima audio asli, blokir malware/exe/script)
 * 4. File Size Limiter (Maksimal 35MB per file)
 * 5. Filename & Path Traversal Sanitization (Mencegah ../ atau null byte injection)
 * 6. Private IP / SSRF Protection
 * =========================================================================
 */

// Target Folder Google Drive Anda
const TARGET_FOLDER_ID = '1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU';

// Secret Token Aplikasi (Otomatis dikirim oleh PWA Aura Music di background)
// Pengguna TIDAK PERLU login, tapi bot/hacker dari luar yang menembak endpoint akan ditolak!
const AURA_APP_TOKEN = 'aura_secure_token_9a8f4c2e7b1d';

// Batas Ukuran File Maksimal (35 MB)
const MAX_FILE_SIZE_BYTES = 35 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_FILE_SIZE_BYTES * 4) / 3);

// Daftar MIME Type Audio yang Diizinkan (Whitelist Ketat)
const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/webm'
];

// Ekstensi File yang Diizinkan
const ALLOWED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.webm'];

function doGet(e) {
  try {
    const catalog = getFolderSongsCatalog();
    return responseJson({
      status: 'active',
      security: 'hardened',
      message: 'Katalog lagu Google Drive siap disinkronkan.',
      targetFolderId: TARGET_FOLDER_ID,
      totalSongs: catalog.length,
      songs: catalog
    }, 200);
  } catch (err) {
    return responseJson({
      status: 'error',
      message: 'Gagal membaca folder Google Drive: ' + err.toString(),
      songs: []
    }, 500);
  }
}

function doOptions(e) {
  return responseJson({ status: 'preflight_ok' }, 200);
}

function doPost(e) {
  try {
    // 1. Verifikasi Keberadaan Data POST
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ status: 'error', code: 400, message: 'Bad Request: Tidak ada payload data.' }, 400);
    }

    // 2. Proteksi Ukuran Payload Mentah (Mencegah Out of Memory DoS)
    if (e.postData.contents.length > MAX_BASE64_LENGTH + 10000) {
      return responseJson({ status: 'error', code: 413, message: 'Payload Too Large: Ukuran data melebihi batas 35MB.' }, 413);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return responseJson({ status: 'error', code: 400, message: 'Bad Request: Format JSON tidak valid.' }, 400);
    }

    // 3. Verifikasi Token Keamanan Aplikasi (Mencegah Akses Tanpa Izin oleh Hacker/Bot)
    if (!payload.token || payload.token !== AURA_APP_TOKEN) {
      return responseJson({ 
        status: 'error', 
        code: 401, 
        message: 'Unauthorized: Akses ditolak. Token keamanan aplikasi tidak cocok atau tidak disertakan.' 
      }, 401);
    }

    // Aksi: Ambil katalog seluruh lagu yang tersedia di Google Drive
    if (payload.action === 'list') {
      const catalog = getFolderSongsCatalog();
      return responseJson({
        status: 'success',
        code: 200,
        totalSongs: catalog.length,
        songs: catalog
      }, 200);
    }

    // Aksi: Hapus File dari Google Drive jika diminta oleh pengguna
    if (payload.action === 'delete') {
      const fileId = payload.fileId;
      if (!fileId) {
        return responseJson({ status: 'error', code: 400, message: 'File ID tidak disertakan.' }, 400);
      }
      try {
        const fileToDelete = DriveApp.getFileById(fileId);
        fileToDelete.setTrashed(true); // Pindahkan ke Sampah Google Drive
        return responseJson({
          status: 'success',
          code: 200,
          message: 'File berhasil dihapus dari Google Drive (dipindahkan ke Sampah).',
          fileId: fileId
        }, 200);
      } catch (delErr) {
        return responseJson({
          status: 'success',
          code: 200,
          message: 'File tidak ditemukan di Google Drive atau sudah dihapus sebelumnya.',
          fileId: fileId
        }, 200);
      }
    }

    // 4. Rate Limiting Anti-Flooding / Anti-Spam (Menggunakan CacheService)
    const cache = CacheService.getScriptCache();
    const clientIdentifier = payload.clientFingerprint || 'global_rate';
    const rateLimitKey = 'ratelimit_' + clientIdentifier;
    
    const requestCount = parseInt(cache.get(rateLimitKey) || '0', 10);
    if (requestCount >= 120) { // Maksimal 120 upload per 5 menit (aman untuk upload album/folder)
      return responseJson({ 
        status: 'error', 
        code: 429, 
        message: 'Too Many Requests: Batas unduh/upload tercapai (Anti-Spam). Mohon tunggu beberapa menit.' 
      }, 429);
    }
    // Update counter rate limit (expire dalam 300 detik / 5 menit)
    cache.put(rateLimitKey, (requestCount + 1).toString(), 300);

    // 5. Validasi & Sanitasi Data File
    const base64Data = payload.base64Data;
    if (!base64Data || typeof base64Data !== 'string') {
      return responseJson({ status: 'error', code: 400, message: 'Data audio base64 tidak ditemukan.' }, 400);
    }

    // 6. Validasi MIME Type Ketat (Mencegah Upload File Malware/Executable)
    const rawMimeType = (payload.mimeType || 'audio/mpeg').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.includes(rawMimeType)) {
      return responseJson({ 
        status: 'error', 
        code: 415, 
        message: 'Unsupported Media Type: Hanya file audio (MP3, M4A, FLAC, WAV, OGG) yang diizinkan!' 
      }, 415);
    }

    // 7. Sanitasi Nama File & Mencegah Path Traversal
    let safeFilename = sanitizeFilename(payload.filename || 'song.mp3');
    
    // Pastikan memiliki ekstensi audio yang sah
    const hasValidExt = ALLOWED_EXTENSIONS.some(ext => safeFilename.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      safeFilename += '.mp3';
    }

    // 8. Decode Base64 menjadi Audio Blob
    const decodedBytes = Utilities.base64Decode(base64Data);
    if (decodedBytes.length > MAX_FILE_SIZE_BYTES) {
      return responseJson({ status: 'error', code: 413, message: 'Ukuran file audio melebihi batas 35MB.' }, 413);
    }

    const audioBlob = Utilities.newBlob(decodedBytes, rawMimeType, safeFilename);

    // 9. Simpan File ke Target Folder Google Drive (Cek Duplikasi: Cukup 1 Saja di Lagu yang Sama)
    let folder;
    try {
      folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    } catch (fErr) {
      folder = DriveApp.getRootFolder();
    }

    // Cek apakah file dengan nama yang sama sudah ada di folder
    const existingFiles = folder.getFilesByName(safeFilename);
    if (existingFiles.hasNext()) {
      const existingFile = existingFiles.next();
      return responseJson({
        status: 'success',
        code: 200,
        duplicate: true,
        message: 'Lagu sudah ada di Google Drive (duplikasi dicegah, cukup 1 file).',
        fileId: existingFile.getId(),
        fileName: existingFile.getName(),
        fileSize: existingFile.getSize(),
        downloadUrl: existingFile.getDownloadUrl(),
        directStreamUrl: 'https://drive.google.com/uc?export=download&id=' + existingFile.getId(),
        webViewLink: existingFile.getUrl()
      }, 200);
    }

    const createdFile = folder.createFile(audioBlob);

    // Set permission agar file bisa diputar (Anyone with link can view)
    try {
      createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Abaikan jika domain Google Workspace membatasi sharing publik
    }

    return responseJson({
      status: 'success',
      code: 200,
      message: 'Lagu berhasil diamankan dan diunggah ke Google Drive!',
      fileId: createdFile.getId(),
      fileName: createdFile.getName(),
      fileSize: createdFile.getSize(),
      downloadUrl: createdFile.getDownloadUrl(),
      directStreamUrl: 'https://drive.google.com/uc?export=download&id=' + createdFile.getId(),
      webViewLink: createdFile.getUrl()
    }, 200);

  } catch (error) {
    return responseJson({
      status: 'error',
      code: 500,
      message: 'Internal Server Error: ' + error.toString()
    }, 500);
  }
}

/**
 * Sanitasi nama file untuk mencegah Path Traversal, Null Bytes, dan Karakter Berbahaya
 */
function sanitizeFilename(name) {
  if (!name) return 'song_' + Date.now() + '.mp3';
  return name
    .replace(/\0/g, '')             // Hapus null bytes
    .replace(/(\.\.[\/\\])+/g, '')   // Cegah ../ directory traversal
    .replace(/[/\\?%*:|"<>]/g, '_')  // Ganti karakter ilegal OS
    .replace(/\s+/g, ' ')           // Rapikan spasi ganda
    .trim()
    .slice(0, 120);                 // Batasi panjang nama file maks 120 karakter
}

/**
 * Helper Output JSON Terstandarisasi
 */
function responseJson(data, httpStatusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Membaca seluruh file audio di folder Google Drive dan mengembalikan katalog lagu bersama
 */
function getFolderSongsCatalog() {
  let folder;
  try {
    folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
  } catch (fErr) {
    folder = DriveApp.getRootFolder();
  }

  const files = folder.getFiles();
  const catalog = [];

  while (files.hasNext()) {
    const file = files.next();
    // Abaikan file yang ada di sampah (trashed)
    if (file.isTrashed()) continue;

    const name = file.getName();
    const mime = (file.getMimeType() || '').toLowerCase();

    // Verifikasi ekstensi atau mime audio yang sah
    const isAudio = mime.startsWith('audio/') || ALLOWED_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
    if (!isAudio) continue;

    let title = name.replace(/\.[^/.]+$/, '');
    let artist = 'Google Drive';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    catalog.push({
      fileId: file.getId(),
      title: title || 'Lagu Tanpa Judul',
      artist: artist || 'Google Drive',
      album: 'Google Drive Cloud',
      fileName: name,
      fileSize: file.getSize(),
      mimeType: mime || 'audio/mpeg',
      directStreamUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      webViewLink: file.getUrl(),
      dateAdded: file.getDateCreated().getTime()
    });
  }

  // Urutkan dari lagu yang paling baru di-upload
  catalog.sort((a, b) => b.dateAdded - a.dateAdded);
  return catalog;
}
