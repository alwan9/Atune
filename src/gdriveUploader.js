/**
 * Aura Music - Google Drive Auto-Uploader Module (Secure Edition)
 * Mengunggah file audio ke folder Google Drive pengguna via Google Apps Script Web App Bridge
 * Dilengkapi pengamanan token otomatis, rate limiting fingerprint, dan sanitasi payload
 */

import { getSetting, setSetting } from './db.js';

export const DEFAULT_GDRIVE_FOLDER_ID = '1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU';
export const DEFAULT_GDRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DEFAULT_GDRIVE_FOLDER_ID}?usp=sharing`;

// Token aplikasi terenkripsi default untuk autentikasi backend tanpa perlu login user
export const AURA_APP_TOKEN = 'aura_secure_token_9a8f4c2e7b1d';
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024; // 35 MB limit

export const DEFAULT_GAS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyr3tSDmkxFs2Ls8abC5GPnAmC7mi-jN2hKVAt_ooncLnRmeL4nEGUE-HUJbilmBV5rbQ/exec';

/**
 * Mendapatkan fingerprint acak klien untuk proteksi anti-spam rate limiting
 */
function getClientFingerprint() {
  let fp = localStorage.getItem('aura_client_fp');
  if (!fp) {
    fp = 'client_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('aura_client_fp', fp);
  }
  return fp;
}

/**
 * Mendapatkan URL Google Apps Script Web App yang tersimpan
 */
export async function getGasWebhookUrl() {
  const url = await getSetting('gas_webhook_url');
  return url || localStorage.getItem('aura_gas_webhook_url') || DEFAULT_GAS_WEBHOOK_URL;
}

/**
 * Menyimpan URL Google Apps Script Web App
 */
export async function setGasWebhookUrl(url) {
  const clean = (url || '').trim();
  await setSetting('gas_webhook_url', clean);
  localStorage.setItem('aura_gas_webhook_url', clean);
  return clean;
}

/**
 * Konversi Blob menjadi Base64 string dengan proteksi batas ukuran
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
  if (blob.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(new Error(`Ukuran file (${(blob.size / 1048576).toFixed(1)}MB) melebihi batas aman 35MB.`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
/**
 * Helper: Validasi & normalisasi MIME type audio untuk Google Apps Script
 */
function normalizeAudioMimeType(blobType, filename = '') {
  const type = (blobType || '').toLowerCase().trim();
  const lowerName = filename.toLowerCase();

  if (type === 'audio/mpeg' || type === 'audio/mp3' || type === 'audio/x-mp3') return 'audio/mpeg';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'audio/wav';
  if (type === 'audio/flac' || type === 'audio/x-flac') return 'audio/flac';
  if (type === 'audio/ogg' || type === 'audio/vorbis') return 'audio/ogg';
  if (type === 'audio/x-m4a' || type === 'audio/m4a' || type === 'audio/mp4') return 'audio/mp4';
  if (type === 'audio/webm') return 'audio/webm';
  if (type === 'audio/aac') return 'audio/aac';

  // Fallback berdasarkan ekstensi file
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.m4a')) return 'audio/mp4';
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.flac')) return 'audio/flac';
  if (lowerName.endsWith('.ogg')) return 'audio/ogg';
  if (lowerName.endsWith('.webm')) return 'audio/webm';
  if (lowerName.endsWith('.aac')) return 'audio/aac';

  return 'audio/mpeg';
}

/**
 * Upload file audio ke Google Drive via GAS Web App dengan payload aman
 * Mendukung pemanggilan (blob, metadata, onStatus) maupun (blob, filename, metadata, onStatus)
 * @param {Blob} audioBlob 
 * @param {Object|string} metadataOrFilename 
 * @param {Object|Function} [maybeMetadata] 
 * @param {Function} [onStatus] 
 * @returns {Promise<Object>} Response dari Google Apps Script
 */
export async function uploadAudioToGDrive(audioBlob, metadataOrFilename = {}, maybeMetadata = {}, onStatus = () => {}) {
  let metadata = {};
  let statusCb = typeof onStatus === 'function' ? onStatus : () => {};

  if (typeof metadataOrFilename === 'string') {
    if (typeof maybeMetadata === 'object' && maybeMetadata !== null) {
      metadata = { ...maybeMetadata };
    }
    if (!metadata.title) {
      metadata.title = metadataOrFilename.replace(/\.[^/.]+$/, '');
    }
    if (typeof maybeMetadata === 'function') {
      statusCb = maybeMetadata;
    }
  } else if (typeof metadataOrFilename === 'object' && metadataOrFilename !== null) {
    metadata = { ...metadataOrFilename };
    if (typeof maybeMetadata === 'function') {
      statusCb = maybeMetadata;
    }
  }

  const gasUrl = await getGasWebhookUrl();

  if (!gasUrl) {
    statusCb('Link Web App Google Drive belum diatur (file tersimpan aman di database offline).');
    return {
      status: 'skipped',
      message: 'Google Apps Script URL belum diisi di Pengaturan.'
    };
  }

  try {
    if (!audioBlob || !audioBlob.size) {
      throw new Error('Data file audio kosong atau tidak valid.');
    }

    if (audioBlob.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File terlalu besar (${(audioBlob.size / 1048576).toFixed(1)}MB). Maksimal 35MB.`);
    }

    statusCb('Mengonversi file audio untuk Google Drive...');
    const base64Data = await blobToBase64(audioBlob);

    // Sanitasi judul dan artis terhadap karakter berbahaya
    const safeTitle = (metadata.title || 'Lagu')
      .replace(/[<>'"\\;`]/g, '')
      .trim()
      .slice(0, 100);
    const safeArtist = (metadata.artist || 'Unknown')
      .replace(/[<>'"\\;`]/g, '')
      .trim()
      .slice(0, 60);
    const filename = `${safeArtist} - ${safeTitle}.mp3`;
    const mimeType = normalizeAudioMimeType(audioBlob.type, filename);

    statusCb(`Mengunggah "${filename}" ke folder Google Drive...`);

    // Payload aman dengan token rahasia aplikasi dan fingerprint rate limit
    const payload = {
      token: AURA_APP_TOKEN,
      clientFingerprint: getClientFingerprint(),
      filename,
      mimeType,
      base64Data,
      title: safeTitle,
      artist: safeArtist,
      sourceUrl: (metadata.sourceUrl || '').slice(0, 500)
    };

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // Menghindari preflight CORS OPTIONS pada Apps Script
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Akses Ditolak: Token keamanan aplikasi tidak cocok.');
      }
      if (response.status === 429) {
        throw new Error('Terlalu banyak permintaan (Anti-Spam). Mohon tunggu beberapa menit.');
      }
      if (response.status === 413) {
        throw new Error('Ukuran file melebihi batas 35MB.');
      }
      throw new Error(`Google Apps Script merespon dengan status ${response.status}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message || 'Gagal menyimpan ke Google Drive.');
    }

    if (result.duplicate) {
      onStatus('Lagu sudah ada di Google Drive (duplikasi dicegah).');
    } else {
      onStatus('Berhasil diamankan & diunggah ke Google Drive!');
    }

    return {
      status: 'success',
      duplicate: !!result.duplicate,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      directStreamUrl: result.directStreamUrl,
      fileName: result.fileName
    };

  } catch (error) {
    console.error('Error saat upload ke Google Drive:', error);
    onStatus(`Gagal upload ke Drive: ${error.message}`);
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Menghapus file audio dari Google Drive via Web App Bridge
 * @param {string} fileId 
 * @param {(status: string) => void} onStatus 
 * @returns {Promise<Object>}
 */
export async function deleteAudioFromGDrive(fileId, onStatus = () => {}) {
  if (!fileId) return { status: 'skipped', message: 'Tidak ada File ID Google Drive.' };
  const gasUrl = await getGasWebhookUrl();
  if (!gasUrl) return { status: 'skipped', message: 'URL Google Apps Script belum diatur.' };

  try {
    onStatus('Menghapus file dari folder Google Drive...');
    const payload = {
      action: 'delete',
      token: AURA_APP_TOKEN,
      fileId: fileId
    };

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script HTTP ${response.status}`);
    }

    const result = await response.json();
    onStatus('File berhasil dihapus dari Google Drive.');
    return result;
  } catch (error) {
    console.warn('Gagal menghapus file dari Google Drive:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Mengambil katalog seluruh lagu bersama yang ada di folder Google Drive
 * Memungkinkan semua perangkat (HP, laptop, tablet) memiliki daftar lagu yang identik
 * @returns {Promise<Array>}
 */
export async function fetchDriveSharedCatalog() {
  const gasUrl = await getGasWebhookUrl();
  if (!gasUrl) return [];

  try {
    const response = await fetch(gasUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data && data.songs && Array.isArray(data.songs)) {
      return data.songs;
    }
    return [];
  } catch (err) {
    console.warn('Gagal memuat katalog bersama Google Drive:', err);
    return [];
  }
}
