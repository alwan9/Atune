import Dexie from 'dexie';

export const db = new Dexie('AuraMusicOfflineDB');

// Skema database
db.version(1).stores({
  songs: '++id, title, artist, album, duration, dateAdded, isFavorite, source',
  playlists: '++id, name, songIds, createdAt',
  settings: 'key, value'
});

db.version(2).stores({
  songs: '++id, title, artist, album, duration, dateAdded, isFavorite, source',
  playlists: '++id, name, songIds, createdAt',
  settings: 'key, value',
  wishlist: '++id, title, artist, url, status, dateAdded, error'
});

/**
 * Menyimpan lagu ke IndexedDB
 * @param {Object} songData 
 * @returns {Promise<number>} ID lagu tersimpan
 */
export async function saveSong(songData) {
  const songRecord = {
    title: songData.title || 'Unknown Title',
    artist: songData.artist || 'Unknown Artist',
    album: songData.album || 'Unknown Album',
    duration: songData.duration || 0,
    audioBlob: songData.audioBlob, // Blob MP3/FLAC/WAV tersimpan offline
    mimeType: songData.mimeType || 'audio/mpeg',
    coverArtBlob: songData.coverArtBlob || null,
    lyrics: songData.lyrics || '',
    dateAdded: Date.now(),
    isFavorite: 0,
    playCount: 0,
    source: songData.source || 'local', // 'local' | 'gdrive' | 'github' | 'url'
    sourceUrl: songData.sourceUrl || '',
    gdriveStatus: songData.gdriveStatus || (songData.source === 'gdrive' ? 'synced' : 'pending'),
    gdriveFileId: songData.gdriveFileId || '',
    gdriveUrl: songData.gdriveUrl || ''
  };
  return await db.songs.add(songRecord);
}

/**
 * Memperbarui data lagu berdasarkan ID
 */
export async function updateSong(id, updates) {
  return await db.songs.update(Number(id), updates);
}

/**
 * Mendapatkan semua lagu tersimpan
 */
export async function getAllSongs() {
  return await db.songs.orderBy('dateAdded').reverse().toArray();
}

/**
 * Mendapatkan lagu berdasarkan ID
 */
export async function getSongById(id) {
  return await db.songs.get(Number(id));
}

/**
 * Menghapus lagu berdasarkan ID
 */
export async function deleteSong(id) {
  return await db.songs.delete(Number(id));
}

/**
 * Toggle status favorit lagu
 */
export async function toggleFavorite(id) {
  const song = await db.songs.get(Number(id));
  if (song) {
    const updated = song.isFavorite ? 0 : 1;
    await db.songs.update(Number(id), { isFavorite: updated });
    return updated === 1;
  }
  return false;
}

/**
 * Tambah hitung putar
 */
export async function incrementPlayCount(id) {
  const song = await db.songs.get(Number(id));
  if (song) {
    await db.songs.update(Number(id), { playCount: (song.playCount || 0) + 1 });
  }
}

/**
 * Ekspor seluruh metadata dan daftar lagu (Backup JSON)
 */
export async function exportLibraryMetadata() {
  const songs = await db.songs.toArray();
  const playlists = await db.playlists.toArray();
  
  // Ekspor tanpa audioBlob agar file JSON ringan
  const exportableSongs = songs.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration,
    lyrics: s.lyrics,
    isFavorite: s.isFavorite,
    source: s.source,
    sourceUrl: s.sourceUrl,
    dateAdded: s.dateAdded
  }));

  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    app: 'Aura Offline Music Player',
    songs: exportableSongs,
    playlists: playlists
  };
}

/**
 * Ambil atau simpan setting
 */
export async function getSetting(key, defaultValue = null) {
  const item = await db.settings.get(key);
  return item ? item.value : defaultValue;
}

export async function setSetting(key, value) {
  return await db.settings.put({ key, value });
}

/**
 * Operasi Wishlist (Antrean Download Otomatis)
 */
export async function addToWishlist(item) {
  return await db.wishlist.add({
    title: item.title || 'Lagu dari Link',
    artist: item.artist || 'Unknown Artist',
    url: item.url || '',
    status: item.status || 'pending', // 'pending' | 'downloading' | 'completed' | 'failed'
    dateAdded: Date.now(),
    error: ''
  });
}

export async function getAllWishlist() {
  return await db.wishlist.orderBy('dateAdded').reverse().toArray();
}

export async function updateWishlistItem(id, updates) {
  return await db.wishlist.update(Number(id), updates);
}

export async function deleteWishlistItem(id) {
  return await db.wishlist.delete(Number(id));
}

/**
 * Estimasi penggunaan penyimpanan offline (MB)
 */
export async function getStorageUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
      const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
      return { usedMB, quotaMB };
    }
  } catch {}
  
  // Fallback hitung ukuran blob lagu
  try {
    const songs = await db.songs.toArray();
    let totalBytes = 0;
    songs.forEach(s => {
      if (s.audioBlob && s.audioBlob.size) totalBytes += s.audioBlob.size;
    });
    return {
      usedMB: (totalBytes / (1024 * 1024)).toFixed(1),
      quotaMB: 'Tidak terbatas'
    };
  } catch {
    return { usedMB: '0', quotaMB: 'N/A' };
  }
}

