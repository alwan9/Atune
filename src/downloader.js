import { parseAudioMetadata } from './metadataParser.js';
import { saveSong, updateSong, getAllSongs } from './db.js';
import { detectUrlType, extractMediaFromUrl } from './mediaExtractor.js';
import { uploadAudioToGDrive, DEFAULT_GDRIVE_FOLDER_ID, DEFAULT_GDRIVE_FOLDER_URL } from './gdriveUploader.js';

export const DEFAULT_GDRIVE_FOLDER = DEFAULT_GDRIVE_FOLDER_URL;

/**
 * Format atau bersihkan URL Google Drive, GitHub, TikTok, YouTube, atau direct URL
 */
export function parseSourceUrl(inputUrl) {
  let url = inputUrl.trim();

  // 1. TikTok URL
  if (url.includes('tiktok.com')) {
    return {
      type: 'tiktok',
      originalUrl: url,
      downloadUrl: url
    };
  }

  // 2. YouTube URL
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return {
      type: 'youtube',
      originalUrl: url,
      downloadUrl: url
    };
  }

  // 3. Google Drive Folder
  const gdriveFolderMatch = url.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
  if (gdriveFolderMatch) {
    return {
      type: 'gdrive_folder',
      id: gdriveFolderMatch[1],
      folderUrl: url,
      originalUrl: url
    };
  }

  // 4. Google Drive File
  const gdriveMatch1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const gdriveMatch2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const driveFileId = gdriveMatch1 ? gdriveMatch1[1] : (gdriveMatch2 ? gdriveMatch2[1] : null);

  if (driveFileId) {
    return {
      type: 'gdrive',
      id: driveFileId,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${driveFileId}`,
      originalUrl: url
    };
  }

  // 5. GitHub URL parsing
  if (url.includes('github.com') && url.includes('/blob/')) {
    const rawGithub = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
    return {
      type: 'github',
      downloadUrl: rawGithub,
      originalUrl: url
    };
  }

  if (url.includes('raw.githubusercontent.com') || url.includes('/releases/download/')) {
    return {
      type: 'github',
      downloadUrl: url,
      originalUrl: url
    };
  }

  // 6. Direct Audio URL biasa
  return {
    type: 'url',
    downloadUrl: url,
    originalUrl: url
  };
}

/**
 * Unduh lagu dari TikTok, YouTube, Google Drive, atau URL umum
 * Otomatis menyimpan ke IndexedDB offline dan mengunggah ke Google Drive
 * 
 * @param {string} rawUrl 
 * @param {Object} metadataOverride (optional title, artist)
 * @param {(statusText: string, percent: number) => void} onProgress 
 * @returns {Promise<{songId: number, gdriveUpload: Object, title: string, artist: string}>}
 */
export async function downloadAndSaveSong(rawUrl, metadataOverride = {}, onProgress = () => {}) {
  const cleanUrl = rawUrl.trim();
  const urlType = detectUrlType(cleanUrl);

  // ==================== JALUR A: TIKTOK / YOUTUBE AUTO EXTRACTOR ====================
  if (urlType === 'tiktok' || urlType === 'youtube') {
    onProgress(`Memulai ekstraksi audio dari ${urlType === 'tiktok' ? 'TikTok' : 'YouTube'}...`, 10);
    
    const mediaResult = await extractMediaFromUrl(cleanUrl, (stage, pct) => {
      onProgress(stage, pct);
    });

    if (!mediaResult || !mediaResult.audioBlob) {
      throw new Error(`Gagal mengekstrak audio dari ${urlType}. Pastikan link publik dan dapat diakses.`);
    }

    onProgress('Menyimpan ke memori offline perangkat (IndexedDB)...', 85);

    const finalSong = {
      title: metadataOverride.title || mediaResult.title || 'Extracted Audio',
      artist: metadataOverride.artist || mediaResult.artist || (urlType === 'tiktok' ? 'TikTok' : 'YouTube'),
      album: mediaResult.album || (urlType === 'tiktok' ? 'TikTok Audio' : 'YouTube Audio'),
      duration: mediaResult.duration || 0,
      audioBlob: mediaResult.audioBlob,
      mimeType: mediaResult.audioBlob.type || 'audio/mpeg',
      coverArtBlob: mediaResult.coverArtBlob || null,
      lyrics: '',
      source: urlType,
      sourceUrl: cleanUrl
    };

    // Cek duplikasi lagu: jika lagu yang sama sudah ada, perbarui alih-alih membuat duplikat
    const existingSongs = await getAllSongs();
    const cleanTitle = (finalSong.title || '').trim().toLowerCase();
    const cleanArtist = (finalSong.artist || '').trim().toLowerCase();
    const existingSong = existingSongs.find(s => 
      s.title?.trim().toLowerCase() === cleanTitle && 
      (s.artist?.trim().toLowerCase() === cleanArtist || !s.artist || s.artist === 'Unknown Artist')
    );

    let newSongId;
    if (existingSong) {
      newSongId = existingSong.id;
      await updateSong(newSongId, finalSong);
    } else {
      newSongId = await saveSong(finalSong);
    }

    // Otomatis Unggah ke Google Drive Folder Pengguna (Folder: 1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU)
    onProgress('Mengunggah otomatis ke Google Drive...', 92);
    let gdriveResult = null;
    try {
      gdriveResult = await uploadAudioToGDrive(
        mediaResult.audioBlob,
        {
          title: finalSong.title,
          artist: finalSong.artist,
          sourceUrl: cleanUrl
        },
        (status) => onProgress(status, 95)
      );
      if (gdriveResult && gdriveResult.status === 'success') {
        await updateSong(newSongId, {
          gdriveStatus: 'synced',
          gdriveFileId: gdriveResult.fileId,
          gdriveUrl: gdriveResult.webViewLink
        });
      } else {
        await updateSong(newSongId, { gdriveStatus: 'pending' });
      }
    } catch (e) {
      console.warn('Auto-upload ke Google Drive gagal:', e);
      gdriveResult = { status: 'error', message: e.message };
      await updateSong(newSongId, { gdriveStatus: 'pending' });
    }

    onProgress('Selesai! Lagu tersimpan offline & terhubung ke Google Drive.', 100);

    return {
      songId: newSongId,
      gdriveUpload: gdriveResult,
      title: finalSong.title,
      artist: finalSong.artist
    };
  }

  // ==================== JALUR B: GOOGLE DRIVE FILE / DIRECT MP3 URL ====================
  const parsed = parseSourceUrl(cleanUrl);
  let targetUrl = parsed.downloadUrl;

  onProgress('Menghubungi server file...', 15);

  try {
    let response;
    try {
      response = await fetch(targetUrl);
    } catch (corsErr) {
      if (parsed.type === 'gdrive') {
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
        response = await fetch(proxyUrl);
      } else {
        throw corsErr;
      }
    }

    if (!response.ok) {
      throw new Error(`Gagal mengunduh: HTTP status ${response.status} (${response.statusText})`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let audioBlob;

    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      let receivedBytes = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        const percent = Math.min(90, Math.round((receivedBytes / totalBytes) * 80) + 15);
        onProgress(`Mengunduh audio: ${Math.round((receivedBytes / 1048576) * 10) / 10} MB / ${Math.round((totalBytes / 1048576) * 10) / 10} MB`, percent);
      }

      audioBlob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
    } else {
      onProgress('Mengunduh data audio...', 50);
      audioBlob = await response.blob();
    }

    // Ekstrak nama file default
    let defaultFileName = 'Downloaded_Track.mp3';
    try {
      const urlObj = new URL(parsed.originalUrl);
      const pathname = urlObj.pathname;
      const fileNameFromPath = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (fileNameFromPath && fileNameFromPath.length > 3) {
        defaultFileName = decodeURIComponent(fileNameFromPath);
      }
    } catch {}

    onProgress('Menganalisis metadata audio (ID3)...', 85);
    const dummyFile = new File([audioBlob], defaultFileName, { type: audioBlob.type });
    const parsedMeta = await parseAudioMetadata(dummyFile);

    const finalSong = {
      title: metadataOverride.title || parsedMeta.title || defaultFileName.replace(/\.[^/.]+$/, ''),
      artist: metadataOverride.artist || parsedMeta.artist || 'Unknown Artist',
      album: metadataOverride.album || parsedMeta.album || (parsed.type === 'gdrive' ? 'Google Drive' : 'Cloud Audio'),
      duration: parsedMeta.duration || 0,
      audioBlob: audioBlob,
      mimeType: audioBlob.type || 'audio/mpeg',
      coverArtBlob: parsedMeta.coverArtBlob,
      lyrics: parsedMeta.lyrics || '',
      source: parsed.type,
      sourceUrl: parsed.originalUrl
    };

    // Cek duplikasi lagu: jika lagu yang sama sudah ada, perbarui alih-alih membuat duplikat
    const existingSongs = await getAllSongs();
    const cleanTitle = (finalSong.title || '').trim().toLowerCase();
    const cleanArtist = (finalSong.artist || '').trim().toLowerCase();
    const existingSong = existingSongs.find(s => 
      s.title?.trim().toLowerCase() === cleanTitle && 
      (s.artist?.trim().toLowerCase() === cleanArtist || !s.artist || s.artist === 'Unknown Artist')
    );

    let newSongId;
    if (existingSong) {
      newSongId = existingSong.id;
      await updateSong(newSongId, finalSong);
    } else {
      newSongId = await saveSong(finalSong);
    }

    // Jika bukan dari Google Drive (misal link MP3 lain), upload ke Google Drive juga
    let gdriveResult = null;
    if (parsed.type !== 'gdrive') {
      try {
        gdriveResult = await uploadAudioToGDrive(
          audioBlob,
          { title: finalSong.title, artist: finalSong.artist, sourceUrl: cleanUrl },
          (st) => onProgress(st, 95)
        );
        if (gdriveResult && gdriveResult.status === 'success') {
          await updateSong(newSongId, {
            gdriveStatus: 'synced',
            gdriveFileId: gdriveResult.fileId,
            gdriveUrl: gdriveResult.webViewLink
          });
        } else {
          await updateSong(newSongId, { gdriveStatus: 'pending' });
        }
      } catch (e) {
        console.warn('Auto upload GDrive failed:', e);
        await updateSong(newSongId, { gdriveStatus: 'pending' });
      }
    } else {
      await updateSong(newSongId, {
        gdriveStatus: 'synced',
        gdriveUrl: parsed.originalUrl
      });
    }

    onProgress('Selesai! Lagu berhasil disimpan ke perpustakaan offline.', 100);

    return {
      songId: newSongId,
      gdriveUpload: gdriveResult,
      title: finalSong.title,
      artist: finalSong.artist
    };
  } catch (err) {
    console.error('Error saat download & save:', err);
    throw err;
  }
}
