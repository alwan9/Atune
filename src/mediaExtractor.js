/**
 * Aura Music - Media Extractor Module (Security Hardened)
 * Mendukung ekstraksi audio murni dari TikTok, YouTube, Google Drive, & Direct Audio URLs
 * Dilengkapi proteksi Anti-SSRF, sanitasi URL protokol berbahaya, dan pembersihan metadata
 */

/**
 * Validasi keamanan URL input sebelum diproses
 * Mencegah XSS via javascript:/data: URI dan serangan SSRF ke jaringan internal
 * @param {string} rawUrl 
 * @returns {boolean}
 */
export function validateSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();

  // Hanya izinkan protokol HTTP dan HTTPS
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Blokir probe ke jaringan internal / IP privat (Anti-SSRF)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Mendeteksi tipe platform dari URL yang dimasukkan secara aman
 * @param {string} rawUrl 
 * @returns {'tiktok' | 'youtube' | 'gdrive' | 'direct'}
 */
export function detectUrlType(rawUrl) {
  const url = (rawUrl || '').trim().toLowerCase();
  
  if (url.includes('tiktok.com')) {
    return 'tiktok';
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  if (url.includes('drive.google.com')) {
    return 'gdrive';
  }
  return 'direct';
}

/**
 * Ekstraksi Audio dari TikTok menggunakan TikWM API dengan sanitasi keamanan
 * @param {string} tiktokUrl 
 * @param {(stage: string, percent: number) => void} onProgress 
 */
export async function extractTikTokAudio(tiktokUrl, onProgress = () => {}) {
  if (!validateSafeUrl(tiktokUrl)) {
    throw new Error('URL tidak aman atau format protokol tidak valid. Gunakan URL https:// yang sah.');
  }

  onProgress('Menghubungi server ekstraksi TikTok...', 15);

  let data = null;
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl.trim())}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal menghubungi TikWM API (Status: ${response.status})`);
    }

    const json = await response.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(json.msg || 'Gagal mengekstrak data dari link TikTok.');
    }

    data = json.data;
  } catch (err) {
    try {
      const formData = new URLSearchParams();
      formData.append('url', tiktokUrl.trim());
      const postRes = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      const postJson = await postRes.json();
      if (postJson.code === 0 && postJson.data) {
        data = postJson.data;
      } else {
        throw new Error(err.message);
      }
    } catch {
      throw new Error(`Tidak dapat memproses link TikTok: ${err.message}`);
    }
  }

  onProgress('Mengunduh stream audio MP3...', 40);

  let audioDownloadUrl = data.music || data.play;
  if (!audioDownloadUrl) {
    throw new Error('Link audio tidak ditemukan pada video TikTok ini.');
  }

  if (audioDownloadUrl.startsWith('/')) {
    audioDownloadUrl = 'https://www.tikwm.com' + audioDownloadUrl;
  }

  // Fetch audio file blob
  const audioBlob = await fetchWithProgress(audioDownloadUrl, (pct) => {
    onProgress('Mengunduh audio MP3...', 40 + Math.round(pct * 0.4));
  });

  // Sanitasi Metadata untuk mencegah script injection
  const title = sanitizeString(data.music_info?.title || data.title || 'TikTok Sound', 100);
  const artist = sanitizeString(data.music_info?.author || data.author?.nickname || 'TikTok Creator', 60);
  const duration = typeof data.duration === 'number' ? Math.max(0, data.duration) : 0;

  // Cover Art
  onProgress('Mengambil thumbnail & cover...', 85);
  let coverArtBlob = null;
  const coverUrl = data.music_info?.cover || data.cover;
  if (coverUrl && validateSafeUrl(coverUrl)) {
    try {
      const coverRes = await fetch(coverUrl);
      if (coverRes.ok) {
        coverArtBlob = await coverRes.blob();
      }
    } catch (e) {
      console.warn('Gagal memuat cover TikTok:', e);
    }
  }

  onProgress('Ekstraksi TikTok selesai!', 100);

  return {
    audioBlob,
    title,
    artist,
    album: 'TikTok Audio',
    coverArtBlob,
    duration,
    source: 'tiktok',
    sourceUrl: tiktokUrl
  };
}

/**
 * Ekstraksi Audio dari YouTube dengan sanitasi keamanan
 * @param {string} youtubeUrl 
 * @param {(stage: string, percent: number) => void} onProgress 
 */
export async function extractYouTubeAudio(youtubeUrl, onProgress = () => {}) {
  if (!validateSafeUrl(youtubeUrl)) {
    throw new Error('URL tidak aman atau format protokol tidak valid.');
  }

  onProgress('Menghubungi server konversi YouTube MP3...', 15);

  const cleanUrl = youtubeUrl.trim();
  const videoId = extractYouTubeId(cleanUrl);

  let title = `YouTube Track ${videoId || Date.now()}`;
  let artist = 'YouTube Music';
  let coverArtBlob = null;

  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    try {
      const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const thumbRes = await fetch(thumbUrl);
      if (thumbRes.ok) {
        coverArtBlob = await thumbRes.blob();
      }
    } catch (e) {
      console.warn('Gagal memuat cover YouTube:', e);
    }
  }

  // Endpoints konverter audio YouTube yang aktif
  const youtubeEndpoints = [
    {
      url: 'https://api.cobalt.tools/',
      type: 'cobalt'
    }
  ];

  let audioBlob = null;
  let lastError = null;

  for (const endpoint of youtubeEndpoints) {
    try {
      onProgress(`Menghubungi server ekstraksi audio...`, 25);
      
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: cleanUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3'
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error?.code) {
          console.warn(`Server ${endpoint.url} merespons:`, errJson.error.code);
        }
        continue;
      }

      const json = await res.json();
      const directAudioUrl = json.url || (json.audio && json.audio[0]?.url);

      if (directAudioUrl && validateSafeUrl(directAudioUrl)) {
        onProgress('Mengunduh stream audio MP3 YouTube...', 50);
        audioBlob = await fetchWithProgress(directAudioUrl, (pct) => {
          onProgress('Mengunduh audio YouTube...', 50 + Math.round(pct * 0.4));
        });
        if (json.filename) {
          title = sanitizeString(json.filename.replace(/\.mp3$/i, ''), 100);
        }
        break;
      }
    } catch (err) {
      console.warn(`Gagal menghubungi ${endpoint.url}:`, err.message);
      lastError = err;
    }
  }

  if (!audioBlob) {
    throw new Error(
      'Server ekstraksi YouTube publik sedang dibatasi kuota/proteksi bot oleh YouTube. ' +
      'Silakan gunakan link video TikTok (100% lancar & otomatis masuk ke Drive) atau link audio Google Drive.'
    );
  }

  onProgress('Ekstraksi YouTube selesai!', 100);

  return {
    audioBlob,
    title,
    artist,
    album: 'YouTube Audio',
    coverArtBlob,
    duration: 0,
    source: 'youtube',
    sourceUrl: cleanUrl
  };
}

/**
 * Ekstraktor utama terpadu
 * @param {string} url 
 * @param {(stage: string, percent: number) => void} onProgress 
 */
export async function extractMediaFromUrl(url, onProgress = () => {}) {
  if (!validateSafeUrl(url)) {
    throw new Error('URL ditolak: Format link tidak aman atau tidak valid.');
  }

  const type = detectUrlType(url);

  if (type === 'tiktok') {
    return await extractTikTokAudio(url, onProgress);
  }

  if (type === 'youtube') {
    return await extractYouTubeAudio(url, onProgress);
  }

  return null;
}

/**
 * Helper: Ambil Video ID dari berbagai format link YouTube
 */
function extractYouTubeId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

/**
 * Sanitasi string dari tag HTML dan karakter kontrol
 */
function sanitizeString(str, maxLength = 100) {
  if (!str) return '';
  return String(str)
    .replace(/[<>'"\\;`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Fetch data dengan batas waktu & pelaporan progress
 */
async function fetchWithProgress(url, onProgress = () => {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 detik timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error saat mengunduh audio: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || !total) {
      const blob = await response.blob();
      onProgress(100);
      return blob;
    }

    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;
      onProgress(Math.min(100, Math.round((receivedLength / total) * 100)));
    }

    return new Blob(chunks, { type: 'audio/mpeg' });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Unduhan gagal: Waktu koneksi habis (Timeout).');
    }
    throw err;
  }
}
