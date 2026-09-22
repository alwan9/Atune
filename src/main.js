import { 
  db, 
  getAllSongs, 
  saveSong, 
  updateSong,
  deleteSong, 
  toggleFavorite, 
  incrementPlayCount, 
  exportLibraryMetadata,
  addToWishlist,
  getAllWishlist,
  updateWishlistItem,
  deleteWishlistItem,
  getStorageUsage,
  getSetting,
  setSetting
} from './db.js';
import { audioEngine } from './audioEngine.js';
import { downloadAndSaveSong, DEFAULT_GDRIVE_FOLDER } from './downloader.js';
import { parseAudioMetadata } from './metadataParser.js';
import { getGasWebhookUrl, setGasWebhookUrl, uploadAudioToGDrive, deleteAudioFromGDrive, fetchDriveSharedCatalog } from './gdriveUploader.js';
import { validateSafeUrl } from './mediaExtractor.js';

// Application State
let playlist = [];
let currentTrackIndex = -1;
let currentTab = 'all'; // 'all' | 'favorites' | 'gdrive' | 'github' | 'mp3-deck' | 'wishlist' | 'settings'
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: repeat all, 2: repeat one
let deferredPrompt = null;
let currentCoverUrl = null;
let isAutoDownloading = false;

// DOM Elements Cache
const elements = {
  // Navigation & Search
  navTabs: document.querySelectorAll('.nav-tab'),
  searchInput: document.getElementById('search-input'),
  badgeAllCount: document.getElementById('badge-all-count'),
  badgeFavCount: document.getElementById('badge-fav-count'),
  badgeWishlistCount: document.getElementById('badge-wishlist-count'),
  btnInstallPwa: document.getElementById('btn-install-pwa'),
  navBrand: document.getElementById('nav-brand'),

  // Views
  viewLibrary: document.getElementById('view-library'),
  viewMp3Deck: document.getElementById('view-mp3-deck'),
  viewWishlist: document.getElementById('view-wishlist'),
  viewSettings: document.getElementById('view-settings'),

  // Library View Elements
  songsContainer: document.getElementById('songs-container'),
  emptyState: document.getElementById('empty-state'),
  viewTitle: document.getElementById('view-title'),
  viewSubtitle: document.getElementById('view-subtitle'),
  btnSyncAllGdrive: document.getElementById('btn-sync-all-gdrive'),
  btnPlayAll: document.getElementById('btn-play-all'),
  btnShuffleAll: document.getElementById('btn-shuffle-all'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),
  globalDropOverlay: document.getElementById('global-drop-overlay'),

  // Dedicated MP3 Deck Player Elements
  deckTitle: document.getElementById('deck-title'),
  deckArtist: document.getElementById('deck-artist'),
  deckCover: document.getElementById('deck-cover'),
  deckVinyl: document.getElementById('deck-vinyl'),
  deckTimeLcd: document.getElementById('deck-time-lcd'),
  deckStatusLed: document.getElementById('deck-status-led'),
  deckVisualizerCanvas: document.getElementById('deck-visualizer-canvas'),
  deckProgressBar: document.getElementById('deck-progress-bar'),
  deckCurrTime: document.getElementById('deck-curr-time'),
  deckTotalTime: document.getElementById('deck-total-time'),
  deckBtnPlayPause: document.getElementById('deck-btn-play-pause'),
  deckIconPlay: document.getElementById('deck-icon-play'),
  deckIconPause: document.getElementById('deck-icon-pause'),
  deckBtnPrev: document.getElementById('deck-btn-prev'),
  deckBtnNext: document.getElementById('deck-btn-next'),
  deckBtnRewind: document.getElementById('deck-btn-rewind'),
  deckBtnForward: document.getElementById('deck-btn-forward'),
  deckVolumeFader: document.getElementById('deck-volume-fader'),
  deckVolLabel: document.getElementById('deck-vol-label'),
  deckSpeedBtns: document.querySelectorAll('.deck-speed-btn'),
  deckSpeedLabel: document.getElementById('deck-speed-label'),
  deckBtnOpenEq: document.getElementById('deck-btn-open-eq'),
  deckBtnOpenLyrics: document.getElementById('deck-btn-open-lyrics'),
  deckQueueContainer: document.getElementById('deck-queue-container'),
  deckQueueCount: document.getElementById('deck-queue-count'),

  // Wishlist View Elements
  wishlistConnBanner: document.getElementById('wishlist-conn-banner'),
  wishlistConnDot: document.getElementById('wishlist-conn-dot'),
  wishlistConnTitle: document.getElementById('wishlist-conn-title'),
  wishlistConnDesc: document.getElementById('wishlist-conn-desc'),
  btnSyncAllWishlist: document.getElementById('btn-sync-all-wishlist'),
  inputWishlistUrl: document.getElementById('input-wishlist-url'),
  inputWishlistTitle: document.getElementById('input-wishlist-title'),
  inputWishlistArtist: document.getElementById('input-wishlist-artist'),
  btnAddWishlist: document.getElementById('btn-add-wishlist'),
  wishlistContainer: document.getElementById('wishlist-container'),
  wishlistEmpty: document.getElementById('wishlist-empty'),
  wishlistTotalCount: document.getElementById('wishlist-total-count'),

  // Settings View Elements
  settingGdriveFolder: document.getElementById('setting-gdrive-folder'),
  settingAutoDl: document.getElementById('setting-auto-dl'),
  settingNotifyDl: document.getElementById('setting-notify-dl'),
  storageUsedText: document.getElementById('storage-used-text'),
  storageProgressBar: document.getElementById('storage-progress-bar'),
  btnSettingsExport: document.getElementById('btn-settings-export'),
  settingsImportJson: document.getElementById('settings-import-json'),
  btnSettingsClear: document.getElementById('btn-settings-clear'),
  btnSettingsInstallPwa: document.getElementById('btn-settings-install-pwa'),

  // Persistent Mini Player Elements
  miniPlayer: document.getElementById('mini-player'),
  miniCover: document.getElementById('mini-cover'),
  miniTitle: document.getElementById('mini-title'),
  miniArtist: document.getElementById('mini-artist'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnRepeat: document.getElementById('btn-repeat'),
  repeatBadge: document.getElementById('repeat-badge'),
  progressBar: document.getElementById('progress-bar'),
  currTime: document.getElementById('curr-time'),
  totalTime: document.getElementById('total-time'),
  volumeBar: document.getElementById('volume-bar'),
  btnMute: document.getElementById('btn-mute'),
  iconVolHigh: document.getElementById('icon-vol-high'),
  iconVolMute: document.getElementById('icon-vol-mute'),

  // Drawer Fullscreen Player Elements
  drawerPlayer: document.getElementById('drawer-player'),
  btnExpandPlayer: document.getElementById('btn-expand-player'),
  btnFullviewToggle: document.getElementById('btn-fullview-toggle'),
  btnCollapsePlayer: document.getElementById('btn-collapse-player'),
  drawerCover: document.getElementById('drawer-cover'),
  drawerTitle: document.getElementById('drawer-title'),
  drawerArtist: document.getElementById('drawer-artist'),
  drawerAlbum: document.getElementById('drawer-album'),
  drawerBtnFavorite: document.getElementById('btn-drawer-favorite'),
  drawerProgressBar: document.getElementById('drawer-progress'),
  drawerCurrTime: document.getElementById('drawer-curr-time'),
  drawerTotalTime: document.getElementById('drawer-total-time'),
  drawerBtnPlayPause: document.getElementById('drawer-btn-play-pause'),
  drawerIconPlay: document.getElementById('drawer-icon-play'),
  drawerIconPause: document.getElementById('drawer-icon-pause'),
  drawerBtnPrev: document.getElementById('drawer-btn-prev'),
  drawerBtnNext: document.getElementById('drawer-btn-next'),
  drawerBtnShuffle: document.getElementById('drawer-btn-shuffle'),
  drawerBtnRepeat: document.getElementById('drawer-btn-repeat'),
  drawerRepeatBadge: document.getElementById('drawer-repeat-badge'),
  visualizerCanvas: document.getElementById('visualizer-canvas'),
  drawerLyricsContainer: document.getElementById('drawer-lyrics-container'),
  drawerLyricsText: document.getElementById('drawer-lyrics-text'),

  // Modals & Popups
  modalDownloader: document.getElementById('modal-downloader'),
  modalEq: document.getElementById('modal-eq'),
  modalSleepTimer: document.getElementById('modal-sleeptimer'),
  modalSettings: document.getElementById('modal-settings'),
  modalCloses: document.querySelectorAll('.modal-close'),

  // Modal Openers
  btnOpenDownloader: document.getElementById('btn-open-downloader'),
  btnOpenEq: document.getElementById('btn-open-eq'),
  btnOpenSleepTimer: document.getElementById('btn-open-sleeptimer'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnQuickLyrics: document.getElementById('btn-quick-lyrics'),
  drawerToggleLyrics: document.getElementById('drawer-toggle-lyrics'),
  drawerToggleEq: document.getElementById('drawer-toggle-eq'),
  drawerToggleSleepTimer: document.getElementById('drawer-toggle-sleeptimer'),

  // Downloader Modal Form Elements
  tabDlCloud: document.getElementById('tab-dl-cloud'),
  tabDlLocal: document.getElementById('tab-dl-local'),
  sectionDlCloud: document.getElementById('section-dl-cloud'),
  sectionDlLocal: document.getElementById('section-dl-local'),
  inputDlUrl: document.getElementById('input-dl-url'),
  inputDlTitle: document.getElementById('input-dl-title'),
  inputDlArtist: document.getElementById('input-dl-artist'),
  btnStartDownload: document.getElementById('btn-start-download'),
  dlProgressBox: document.getElementById('dl-progress-box'),
  dlProgressBar: document.getElementById('dl-progress-bar'),
  dlStatusText: document.getElementById('dl-status-text'),
  dlPercentText: document.getElementById('dl-percent-text'),
  fileInput: document.getElementById('file-input'),
  dropZone: document.getElementById('drop-zone'),
  btnBrowseFiles: document.getElementById('btn-browse-files'),
  localUploadStatus: document.getElementById('local-upload-status'),

  // Sleep Timer
  badgeTimer: document.getElementById('badge-timer'),
  timerOptBtns: document.querySelectorAll('.timer-opt-btn'),
  btnCancelTimer: document.getElementById('btn-cancel-timer'),

  // Toast
  toast: document.getElementById('toast'),
  toastMsg: document.getElementById('toast-msg')
};

// ======================== INITIALIZATION ========================
async function initApp() {
  registerServiceWorker();
  setupPwaInstallPrompt();
  setupAudioListeners();
  setupEventListeners();
  setupVisualizers();
  setupOnlineOfflineHandler();
  await refreshLibrary();
  await refreshWishlist();
  await updateStorageDisplay();

  // Load saved default Google Drive folder if exists
  const savedGdrive = await getSetting('gdrive_folder', DEFAULT_GDRIVE_FOLDER);
  if (elements.settingGdriveFolder) elements.settingGdriveFolder.value = savedGdrive;

  // Latar belakang: Sinkronkan katalog bersama dari Google Drive agar semua perangkat memiliki daftar lagu yang sama
  if (navigator.onLine) {
    syncCatalogFromGoogleDrive(false);
    setTimeout(() => {
      syncPendingSongsToGDrive(false);
    }, 3000);
  }
}

// ======================== PWA & SERVICE WORKER ========================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
          console.log('PWA Service Worker registered:', reg.scope);
        })
        .catch((err) => console.warn('PWA Service Worker error:', err));
    });
  }
}

function setupPwaInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    elements.btnInstallPwa?.classList.remove('hidden');
    elements.btnInstallPwa?.classList.add('flex');
  });

  const triggerInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        elements.btnInstallPwa?.classList.add('hidden');
        showToast('ATune berhasil diinstal di perangkat!');
      }
      deferredPrompt = null;
    } else {
      showToast('Aplikasi sudah siap digunakan secara offline.');
    }
  };

  elements.btnInstallPwa?.addEventListener('click', triggerInstall);
  elements.btnSettingsInstallPwa?.addEventListener('click', triggerInstall);
}

// ======================== ONLINE / OFFLINE AUTO-DOWNLOAD ========================
function setupOnlineOfflineHandler() {
  const updateStatus = () => {
    const isOnline = navigator.onLine;
    if (elements.wishlistConnDot) {
      if (isOnline) {
        elements.wishlistConnDot.className = 'w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse';
        elements.wishlistConnTitle.textContent = 'Status: Terhubung ke Internet (Online)';
        elements.wishlistConnDesc.textContent = 'Lagu di Wishlist akan otomatis ter-download ke database offline.';
      } else {
        elements.wishlistConnDot.className = 'w-3.5 h-3.5 rounded-full bg-rose-400 shadow-lg shadow-rose-400/50';
        elements.wishlistConnTitle.textContent = 'Status: Mode Offline (Tidak Ada Internet)';
        elements.wishlistConnDesc.textContent = 'Lagu yang ditambahkan tersimpan di antrean Wishlist, akan otomatis diunduh saat koneksi kembali.';
      }
    }
  };

  window.addEventListener('online', () => {
    updateStatus();
    showToast('Internet terhubung! Menyinkronkan daftar lagu bersama...');
    syncCatalogFromGoogleDrive(false);
    if (elements.settingAutoDl?.checked !== false) {
      processWishlistQueue();
    }
    syncPendingSongsToGDrive(false);
  });

  window.addEventListener('offline', () => {
    updateStatus();
    showToast('Mode Offline aktif: Anda tetap dapat memutar seluruh lagu yang sudah tersimpan.');
  });

  updateStatus();
}

/**
 * Memproses semua antrean wishlist yang pending secara otomatis
 */
async function processWishlistQueue() {
  if (!navigator.onLine || isAutoDownloading) return;

  const items = await getAllWishlist();
  const pendingItems = items.filter(it => it.status === 'pending' || it.status === 'failed');
  if (pendingItems.length === 0) return;

  isAutoDownloading = true;

  for (const item of pendingItems) {
    if (!navigator.onLine) break; // Berhenti jika koneksi terputus

    try {
      await updateWishlistItem(item.id, { status: 'downloading' });
      await refreshWishlist();

      await downloadAndSaveSong(item.url, { title: item.title, artist: item.artist });
      await updateWishlistItem(item.id, { status: 'completed' });
      
      if (elements.settingNotifyDl?.checked !== false) {
        showToast(`Wishlist "${item.title}" berhasil diunduh ke offline!`);
      }
    } catch (err) {
      console.warn('Gagal unduh wishlist item:', item.title, err);
      await updateWishlistItem(item.id, { status: 'failed', error: err.message || 'CORS / Network Error' });
    }
  }

  isAutoDownloading = false;
  await refreshWishlist();
  await refreshLibrary();
  await updateStorageDisplay();
}

// ======================== LIBRARY & VIEW MANAGEMENT ========================
function switchView(tabKey) {
  currentTab = tabKey;

  // Sembunyikan semua kontainer view
  elements.viewLibrary?.classList.add('hidden');
  elements.viewMp3Deck?.classList.add('hidden');
  elements.viewWishlist?.classList.add('hidden');
  elements.viewSettings?.classList.add('hidden');

  // Perbarui status active di sidebar
  elements.navTabs.forEach(tab => {
    if (tab.dataset.tab === tabKey) {
      tab.classList.add('tab-active');
      tab.classList.remove('text-slate-400');
    } else {
      tab.classList.remove('tab-active');
      tab.classList.add('text-slate-400');
    }
  });

  if (tabKey === 'mp3-deck') {
    elements.viewMp3Deck?.classList.remove('hidden');
    updateDeckUI();
    renderDeckQueue();
  } else if (tabKey === 'wishlist') {
    elements.viewWishlist?.classList.remove('hidden');
    refreshWishlist();
  } else if (tabKey === 'settings') {
    elements.viewSettings?.classList.remove('hidden');
    updateStorageDisplay();
  } else {
    // Tab Perpustakaan (all, favorites, gdrive, github)
    elements.viewLibrary?.classList.remove('hidden');
    updateViewHeaders(tabKey);
    refreshLibrary();
  }
}

async function refreshLibrary() {
  const allSongs = await getAllSongs();
  
  if (elements.badgeAllCount) elements.badgeAllCount.textContent = allSongs.length;
  if (elements.badgeFavCount) elements.badgeFavCount.textContent = allSongs.filter(s => s.isFavorite).length;

  let filtered = allSongs;
  if (currentTab === 'favorites') {
    filtered = allSongs.filter(s => s.isFavorite);
  } else if (currentTab === 'gdrive') {
    filtered = allSongs.filter(s => s.source === 'gdrive');
  } else if (currentTab === 'local') {
    filtered = allSongs.filter(s => s.source === 'local');
  }

  const query = elements.searchInput?.value.trim().toLowerCase() || '';
  if (query) {
    filtered = filtered.filter(s => 
      (s.title && s.title.toLowerCase().includes(query)) ||
      (s.artist && s.artist.toLowerCase().includes(query)) ||
      (s.album && s.album.toLowerCase().includes(query))
    );
  }

  playlist = filtered;
  renderSongList(filtered);
  renderDeckQueue();
}

function renderSongList(songs) {
  if (!elements.songsContainer) return;
  elements.songsContainer.innerHTML = '';

  if (songs.length === 0) {
    elements.emptyState?.classList.remove('hidden');
    return;
  }

  elements.emptyState?.classList.add('hidden');

  songs.forEach((song, index) => {
    const isCurrentPlaying = currentTrackIndex !== -1 && playlist[currentTrackIndex]?.id === song.id;
    
    const card = document.createElement('div');
    card.className = `song-card group flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 cursor-pointer ${
      isCurrentPlaying 
        ? 'bg-brand-500/15 border-brand-500/40 shadow-lg shadow-brand-500/10' 
        : 'glass-card glass-card-hover border-slate-800/70'
    }`;
    card.dataset.index = index;
    card.dataset.id = song.id;

    let coverSrc = 'icons/icon-192.png';
    if (song.coverArtBlob) {
      coverSrc = URL.createObjectURL(song.coverArtBlob);
    }

    const sourceBadge = getSourceBadgeHtml(song.source);
    const isDriveSynced = song.gdriveStatus === 'synced' || song.source === 'gdrive';
    const driveBadge = isDriveSynced 
      ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-1" title="Tersimpan di Google Drive"><span>☁</span> Drive</span>` 
      : '';

    const driveBtnHtml = isDriveSynced 
      ? `<button class="btn-item-gdrive p-1.5 sm:p-2 rounded-xl text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition flex items-center gap-1" title="Tersimpan di Google Drive. Klik untuk buka/cek." data-id="${song.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17l5.59-5.59L17 10l-7 7z"/>
          </svg>
        </button>`
      : `<button class="btn-item-gdrive p-1.5 sm:p-2 rounded-xl text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition flex items-center gap-1" title="Upload ke Google Drive" data-id="${song.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"/>
          </svg>
        </button>`;

    card.innerHTML = `
      <div class="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <div class="w-5 sm:w-6 text-center text-xs font-mono font-semibold flex-shrink-0 ${isCurrentPlaying ? 'text-brand-400' : 'text-slate-500'}">
          ${isCurrentPlaying ? `
            <div class="flex items-center justify-center gap-0.5 h-3.5">
              <span class="w-0.5 bg-brand-400 h-full animate-pulse"></span>
              <span class="w-0.5 bg-brand-cyan h-2/3 animate-pulse delay-75"></span>
              <span class="w-0.5 bg-brand-400 h-4/5 animate-pulse delay-150"></span>
            </div>
          ` : (index + 1)}
        </div>

        <div class="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 border border-slate-700/50 shadow-sm">
          <img src="${coverSrc}" alt="${escapeHtml(song.title)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>

        <div class="min-w-0 flex-1 pr-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <h4 class="text-xs sm:text-sm font-semibold truncate ${isCurrentPlaying ? 'text-brand-400 font-bold' : 'text-slate-100'}">${escapeHtml(song.title)}</h4>
            <span class="flex-shrink-0">${sourceBadge}</span>
            ${driveBadge ? `<span class="flex-shrink-0 hidden xs:inline">${driveBadge}</span>` : ''}
          </div>
          <p class="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">${escapeHtml(song.artist)} <span class="text-slate-600">•</span> <span class="text-slate-500">${escapeHtml(song.album || 'Single')}</span></p>
        </div>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0">
        <span class="text-[11px] sm:text-xs font-mono text-slate-400 hidden sm:block">${formatTime(song.duration)}</span>

        ${driveBtnHtml}

        <button class="btn-item-fav p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-400 transition" title="Favorit" data-id="${song.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 ${song.isFavorite ? 'text-rose-500 fill-current' : ''}" fill="${song.isFavorite ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
          </svg>
        </button>

        <button class="btn-item-del p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-rose-400 transition sm:opacity-0 sm:group-hover:opacity-100" title="Hapus dari penyimpanan offline" data-id="${song.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-item-fav') || e.target.closest('.btn-item-del') || e.target.closest('.btn-item-gdrive')) return;
      playTrackByIndex(index);
    });

    const gdriveBtn = card.querySelector('.btn-item-gdrive');
    gdriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isDriveSynced && song.gdriveUrl) {
        window.open(song.gdriveUrl, '_blank');
        showToast(`Membuka "${song.title}" di Google Drive...`);
        return;
      }
      showToast(`☁️ Mengunggah "${song.title}" ke Google Drive...`);
      try {
        const res = await uploadAudioToGDrive(song.audioBlob, {
          title: song.title,
          artist: song.artist,
          sourceUrl: song.sourceUrl || ''
        });
        if (res && res.status === 'success') {
          showToast(`✓ Berhasil! "${song.title}" telah tersimpan di Google Drive.`);
          await updateSong(song.id, {
            gdriveStatus: 'synced',
            gdriveFileId: res.fileId,
            gdriveUrl: res.webViewLink
          });
          song.gdriveStatus = 'synced';
          song.gdriveUrl = res.webViewLink;
          refreshLibrary();
        } else {
          showToast(res?.message || 'Gagal mengunggah ke Google Drive. Periksa koneksi.');
        }
      } catch (err) {
        showToast(`Gagal upload: ${err.message}`);
      }
    });

    const favBtn = card.querySelector('.btn-item-fav');
    favBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = await toggleFavorite(song.id);
      song.isFavorite = updated ? 1 : 0;
      refreshLibrary();
    });

    const delBtn = card.querySelector('.btn-item-del');
    delBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hasDriveFile = song.gdriveFileId || song.source === 'gdrive';
      const confirmMsg = hasDriveFile
        ? `Hapus "${song.title}" dari database offline perangkat DAN dari folder Google Drive?`
        : `Hapus "${song.title}" dari database offline perangkat?`;

      if (confirm(confirmMsg)) {
        const driveId = song.gdriveFileId || (song.sourceUrl ? (song.sourceUrl.match(/[-\w]{25,}/) || [])[0] : null);
        if (driveId && navigator.onLine) {
          showToast(`Menghapus "${song.title}" dari Google Drive...`);
          try {
            await deleteAudioFromGDrive(driveId);
            console.log(`[Google Drive] File ${driveId} berhasil dihapus.`);
          } catch (driveErr) {
            console.warn('Gagal menghapus dari Google Drive:', driveErr);
          }
        }

        await deleteSong(song.id);
        if (currentTrackIndex === index) {
          audioEngine.pause();
          currentTrackIndex = -1;
          resetPlayerUI();
        }
        showToast(`✓ "${song.title}" berhasil dihapus dari perangkat & Google Drive.`);
        refreshLibrary();
        updateStorageDisplay();
      }
    });

    elements.songsContainer.appendChild(card);
  });
}

function getSourceBadgeHtml(source) {
  if (source === 'tiktok') {
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"><span>🎵</span> TikTok</span>`;
  } else if (source === 'youtube') {
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1"><span>▶</span> YouTube</span>`;
  } else if (source === 'gdrive') {
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"><span>☁</span> Drive</span>`;
  } else if (source === 'local') {
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"><span>📁</span> Lokal</span>`;
  } else if (source === 'github') {
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">GitHub</span>`;
  }
  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Offline</span>`;
}

// ======================== WISHLIST IMPLEMENTATION ========================
async function refreshWishlist() {
  const items = await getAllWishlist();
  const pendingCount = items.filter(it => it.status === 'pending').length;
  
  if (elements.badgeWishlistCount) elements.badgeWishlistCount.textContent = pendingCount;
  if (elements.wishlistTotalCount) elements.wishlistTotalCount.textContent = `${items.length} Item`;

  if (!elements.wishlistContainer) return;
  elements.wishlistContainer.innerHTML = '';

  if (items.length === 0) {
    elements.wishlistEmpty?.classList.remove('hidden');
    return;
  }
  elements.wishlistEmpty?.classList.add('hidden');

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'glass-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-800';

    let statusBadge = '';
    if (item.status === 'completed') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">✓ Tersimpan Offline</span>`;
    } else if (item.status === 'downloading') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 animate-pulse">⏳ Mengunduh...</span>`;
    } else if (item.status === 'failed') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">✕ Gagal (Coba Lagi)</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">⏱ Menunggu Internet</span>`;
    }

    card.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h4 class="text-sm font-bold text-white truncate">${escapeHtml(item.title)}</h4>
          ${statusBadge}
        </div>
        <p class="text-xs text-slate-400 truncate">${escapeHtml(item.artist || 'Unknown Artist')}</p>
        <p class="text-[11px] font-mono text-slate-500 truncate mt-0.5">${escapeHtml(item.url)}</p>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        ${item.status !== 'completed' ? `
          <button class="btn-wishlist-download px-3 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 text-xs font-semibold transition" data-id="${item.id}">
            Unduh Sekarang
          </button>
        ` : ''}
        <button class="btn-wishlist-del p-2 rounded-xl text-slate-500 hover:text-rose-400 transition" title="Hapus dari Wishlist" data-id="${item.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;

    // Download button handler
    const dlBtn = card.querySelector('.btn-wishlist-download');
    dlBtn?.addEventListener('click', async () => {
      try {
        await updateWishlistItem(item.id, { status: 'downloading' });
        refreshWishlist();
        showToast(`Mengunduh "${item.title}"...`);
        await downloadAndSaveSong(item.url, { title: item.title, artist: item.artist });
        await updateWishlistItem(item.id, { status: 'completed' });
        showToast(`Lagu "${item.title}" berhasil diunduh ke offline database!`);
        refreshWishlist();
        refreshLibrary();
        updateStorageDisplay();
      } catch (err) {
        await updateWishlistItem(item.id, { status: 'failed', error: err.message });
        refreshWishlist();
        showToast(`Gagal: ${err.message || 'Cek URL'}`);
      }
    });

    // Delete handler
    const delBtn = card.querySelector('.btn-wishlist-del');
    delBtn?.addEventListener('click', async () => {
      await deleteWishlistItem(item.id);
      refreshWishlist();
      showToast('Item dihapus dari Wishlist.');
    });

    elements.wishlistContainer.appendChild(card);
  });
}

// ======================== DEDICATED MP3 DECK PLAYER ========================
function updateDeckUI() {
  if (!elements.viewMp3Deck || elements.viewMp3Deck.classList.contains('hidden')) return;

  const currentSong = playlist[currentTrackIndex];
  if (currentSong) {
    elements.deckTitle.textContent = currentSong.title;
    elements.deckArtist.textContent = currentSong.artist;
    if (elements.deckCover && currentCoverUrl) elements.deckCover.src = currentCoverUrl;
    elements.deckStatusLed.textContent = audioEngine.audio.paused ? 'PAUSED' : 'PLAYING';
  } else {
    elements.deckTitle.textContent = 'Pilih lagu untuk memutar';
    elements.deckArtist.textContent = 'ATune MP3 Player';
    elements.deckStatusLed.textContent = 'STANDBY';
  }
}

function renderDeckQueue() {
  if (!elements.deckQueueContainer) return;
  elements.deckQueueContainer.innerHTML = '';
  if (elements.deckQueueCount) elements.deckQueueCount.textContent = `${playlist.length} Lagu`;

  playlist.forEach((song, idx) => {
    const isPlaying = idx === currentTrackIndex;
    const row = document.createElement('div');
    row.className = `flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
      isPlaying ? 'bg-brand-500/20 text-brand-300 font-bold' : 'hover:bg-slate-800/60 text-slate-300'
    }`;
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="text-xs font-mono w-5 text-slate-500">${idx + 1}</span>
        <span class="text-xs truncate flex-1">${escapeHtml(song.title)} - ${escapeHtml(song.artist)}</span>
      </div>
      <span class="text-xs font-mono text-slate-400 ml-2">${formatTime(song.duration)}</span>
    `;
    row.addEventListener('click', () => playTrackByIndex(idx));
    elements.deckQueueContainer.appendChild(row);
  });
}

// ======================== PLAYBACK LOGIC ========================
async function playTrackByIndex(index) {
  if (index < 0 || index >= playlist.length) return;

  currentTrackIndex = index;
  const song = playlist[currentTrackIndex];
  if (!song) return;

  let audioSource = song.audioBlob;
  if (!audioSource) {
    const streamUrl = song.sourceUrl || song.directStreamUrl || (song.gdriveFileId ? `https://drive.google.com/uc?export=download&id=${song.gdriveFileId}` : null);
    if (!streamUrl) {
      showToast('File audio belum tersedia.');
      return;
    }
    audioSource = streamUrl;
    showToast(`Memutar "${song.title}" dari Google Drive...`);

    // Latar belakang: unduh audio blob agar tersimpan offline di perangkat ini
    fetch(streamUrl)
      .then(res => res.ok ? res.blob() : null)
      .then(async (blob) => {
        if (blob && blob.size > 1000) {
          await updateSong(song.id, { audioBlob: blob });
          song.audioBlob = blob;
          console.log(`[Offline Cache] "${song.title}" sekarang tersimpan offline di perangkat ini.`);
        }
      })
      .catch(() => {});
  }

  if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl);

  let coverUrl = 'icons/icon-512.png';
  if (song.coverArtBlob) {
    coverUrl = URL.createObjectURL(song.coverArtBlob);
    currentCoverUrl = coverUrl;
  }

  // Update Mini Player UI
  elements.miniTitle.textContent = song.title;
  elements.miniArtist.textContent = song.artist;
  elements.miniCover.src = coverUrl;

  // Update Drawer UI
  elements.drawerTitle.textContent = song.title;
  elements.drawerArtist.textContent = song.artist;
  elements.drawerAlbum.textContent = song.album || 'Single';
  elements.drawerCover.src = coverUrl;
  if (song.lyrics) {
    elements.drawerLyricsText.textContent = song.lyrics;
  } else {
    elements.drawerLyricsText.textContent = 'Tidak ada lirik tersimpan untuk lagu ini.';
  }

  // Update Deck MP3 Player UI
  updateDeckUI();
  renderDeckQueue();
  updateDrawerFavButton(song.isFavorite);

  // Load into Web Audio Engine
  await audioEngine.loadTrack(audioSource, {
    title: song.title,
    artist: song.artist,
    album: song.album,
    coverArtUrl: coverUrl
  });

  try {
    await audioEngine.play();
    incrementPlayCount(song.id);
  } catch (err) {
    console.warn('Playback error:', err);
  }

  refreshLibrary();
}

function updateDrawerFavButton(isFav) {
  if (!elements.drawerBtnFavorite) return;
  if (isFav) {
    elements.drawerBtnFavorite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-rose-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
  } else {
    elements.drawerBtnFavorite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
  }
}

function resetPlayerUI() {
  elements.miniTitle.textContent = 'Pilih lagu untuk memutar';
  elements.miniArtist.textContent = 'ATune Music Player';
  elements.miniCover.src = 'icons/icon-192.png';
  elements.drawerTitle.textContent = 'Pilih Lagu';
  elements.drawerArtist.textContent = 'ATune Offline Player';
  elements.drawerAlbum.textContent = 'ATune';
  elements.drawerCover.src = 'icons/icon-512.png';
  elements.progressBar.value = 0;
  elements.drawerProgressBar.value = 0;
  if (elements.deckProgressBar) elements.deckProgressBar.value = 0;
  elements.currTime.textContent = '0:00';
  elements.totalTime.textContent = '0:00';
  elements.drawerCurrTime.textContent = '0:00';
  elements.drawerTotalTime.textContent = '0:00';
  if (elements.deckCurrTime) elements.deckCurrTime.textContent = '0:00';
  if (elements.deckTotalTime) elements.deckTotalTime.textContent = '0:00';
  if (elements.deckTimeLcd) elements.deckTimeLcd.textContent = '0:00 / 0:00';
  togglePlayIcons(false);
  updateDeckUI();
}

function togglePlayIcons(isPlaying) {
  // Mini Player
  elements.iconPlay?.classList.toggle('hidden', isPlaying);
  elements.iconPause?.classList.toggle('hidden', !isPlaying);
  
  // Drawer
  elements.drawerIconPlay?.classList.toggle('hidden', isPlaying);
  elements.drawerIconPause?.classList.toggle('hidden', !isPlaying);
  elements.drawerCover?.parentElement?.classList.toggle('animate-spin-slow', isPlaying);
  elements.drawerCover?.parentElement?.classList.toggle('paused', !isPlaying);

  // Dedicated MP3 Deck Player
  elements.deckIconPlay?.classList.toggle('hidden', isPlaying);
  elements.deckIconPause?.classList.toggle('hidden', !isPlaying);
  elements.deckVinyl?.classList.toggle('animate-spin-slow', isPlaying);
  elements.deckVinyl?.classList.toggle('paused', !isPlaying);
  if (elements.deckStatusLed) elements.deckStatusLed.textContent = isPlaying ? 'PLAYING' : 'PAUSED';
}

function nextTrack() {
  if (playlist.length === 0) return;
  if (isShuffle) {
    const randomIndex = Math.floor(Math.random() * playlist.length);
    playTrackByIndex(randomIndex);
  } else {
    let nextIndex = currentTrackIndex + 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    playTrackByIndex(nextIndex);
  }
}

function prevTrack() {
  if (playlist.length === 0) return;
  if (audioEngine.audio.currentTime > 3) {
    audioEngine.seek(0);
    return;
  }
  let prevIndex = currentTrackIndex - 1;
  if (prevIndex < 0) prevIndex = playlist.length - 1;
  playTrackByIndex(prevIndex);
}

// ======================== AUDIO ENGINE & VISUALIZERS ========================
function setupAudioListeners() {
  audioEngine.onTimeUpdate = (current, duration) => {
    if (duration > 0) {
      const percent = (current / duration) * 100;
      elements.progressBar.value = percent;
      elements.drawerProgressBar.value = percent;
      if (elements.deckProgressBar) elements.deckProgressBar.value = percent;

      const formattedCur = formatTime(current);
      const formattedDur = formatTime(duration);

      elements.currTime.textContent = formattedCur;
      elements.totalTime.textContent = formattedDur;
      elements.drawerCurrTime.textContent = formattedCur;
      elements.drawerTotalTime.textContent = formattedDur;

      if (elements.deckCurrTime) elements.deckCurrTime.textContent = formattedCur;
      if (elements.deckTotalTime) elements.deckTotalTime.textContent = formattedDur;
      if (elements.deckTimeLcd) elements.deckTimeLcd.textContent = `${formattedCur} / ${formattedDur}`;
    }
  };

  audioEngine.onPlayStateChange = (isPlaying) => {
    togglePlayIcons(isPlaying);
  };

  audioEngine.onTrackEnded = () => {
    if (repeatMode === 2) {
      audioEngine.seek(0);
      audioEngine.play();
    } else if (repeatMode === 1 || currentTrackIndex < playlist.length - 1 || isShuffle) {
      nextTrack();
    } else {
      togglePlayIcons(false);
    }
  };

  audioEngine.setupMediaSessionActions({
    onPlay: () => audioEngine.play(),
    onPause: () => audioEngine.pause(),
    onPrevious: () => prevTrack(),
    onNext: () => nextTrack()
  });
}

function setupVisualizers() {
  const canvasDrawer = elements.visualizerCanvas;
  const canvasDeck = elements.deckVisualizerCanvas;

  function renderVisualizerLoop() {
    requestAnimationFrame(renderVisualizerLoop);
    const data = audioEngine.getVisualizerData();

    // 1. Drawer Canvas Visualizer
    if (canvasDrawer) {
      const ctx = canvasDrawer.getContext('2d');
      if (!data || data.length === 0) {
        ctx.clearRect(0, 0, canvasDrawer.width, canvasDrawer.height);
      } else {
        ctx.clearRect(0, 0, canvasDrawer.width, canvasDrawer.height);
        const barWidth = canvasDrawer.width / (data.length * 0.75);
        let x = 0;
        for (let i = 0; i < data.length * 0.75; i++) {
          const barHeight = (data[i] / 255) * (canvasDrawer.height - 4);
          const grad = ctx.createLinearGradient(0, canvasDrawer.height, 0, canvasDrawer.height - barHeight);
          grad.addColorStop(0, '#10b981');
          grad.addColorStop(0.5, '#06b6d4');
          grad.addColorStop(1, '#818cf8');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, canvasDrawer.height - barHeight, barWidth - 1.5, barHeight, [2, 2, 0, 0]);
          ctx.fill();
          x += barWidth;
        }
      }
    }

    // 2. MP3 Deck LCD Waveform Visualizer
    if (canvasDeck && !elements.viewMp3Deck.classList.contains('hidden')) {
      const ctx = canvasDeck.getContext('2d');
      if (!data || data.length === 0) {
        ctx.clearRect(0, 0, canvasDeck.width, canvasDeck.height);
      } else {
        ctx.clearRect(0, 0, canvasDeck.width, canvasDeck.height);
        const barWidth = canvasDeck.width / (data.length * 0.75);
        let x = 0;
        for (let i = 0; i < data.length * 0.75; i++) {
          const barHeight = (data[i] / 255) * (canvasDeck.height - 2);
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(x, canvasDeck.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }
    }
  }

  renderVisualizerLoop();
}

// ======================== STORAGE USAGE MONITOR ========================
async function updateStorageDisplay() {
  const { usedMB, quotaMB } = await getStorageUsage();
  if (elements.storageUsedText) {
    elements.storageUsedText.textContent = `${usedMB} MB (Tersedia: ${quotaMB} MB)`;
  }
  if (elements.storageProgressBar) {
    const pct = Math.min(100, Math.max(3, (parseFloat(usedMB) / 500) * 100));
    elements.storageProgressBar.style.width = `${pct}%`;
  }
}

// ======================== DOM EVENT LISTENERS ========================
function setupEventListeners() {
  // Navigation brand logo click -> return to library
  elements.navBrand?.addEventListener('click', () => switchView('all'));

  // Sidebar Tabs
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabKey = tab.dataset.tab;
      switchView(tabKey);
    });
  });

  // Search Input
  elements.searchInput?.addEventListener('input', () => refreshLibrary());

  // Play / Pause toggles
  const handlePlayPause = () => {
    if (currentTrackIndex === -1 && playlist.length > 0) {
      playTrackByIndex(0);
    } else if (audioEngine.audio.paused) {
      audioEngine.play();
    } else {
      audioEngine.pause();
    }
  };

  elements.btnPlayPause?.addEventListener('click', handlePlayPause);
  elements.drawerBtnPlayPause?.addEventListener('click', handlePlayPause);
  elements.deckBtnPlayPause?.addEventListener('click', handlePlayPause);

  // Next & Prev
  elements.btnNext?.addEventListener('click', nextTrack);
  elements.drawerBtnNext?.addEventListener('click', nextTrack);
  elements.deckBtnNext?.addEventListener('click', nextTrack);

  elements.btnPrev?.addEventListener('click', prevTrack);
  elements.drawerBtnPrev?.addEventListener('click', prevTrack);
  elements.deckBtnPrev?.addEventListener('click', prevTrack);

  // Rewind & Forward 10s on MP3 Deck
  elements.deckBtnRewind?.addEventListener('click', () => {
    audioEngine.seek(audioEngine.audio.currentTime - 10);
  });
  elements.deckBtnForward?.addEventListener('click', () => {
    audioEngine.seek(audioEngine.audio.currentTime + 10);
  });

  // Play All & Shuffle All in Library
  elements.btnPlayAll?.addEventListener('click', () => {
    if (playlist.length > 0) playTrackByIndex(0);
  });
  elements.btnShuffleAll?.addEventListener('click', () => {
    if (playlist.length > 0) {
      isShuffle = true;
      updateShuffleUI();
      const randomIndex = Math.floor(Math.random() * playlist.length);
      playTrackByIndex(randomIndex);
    }
  });

  // Shuffle & Repeat toggles
  const toggleShuffle = () => {
    isShuffle = !isShuffle;
    updateShuffleUI();
    showToast(isShuffle ? 'Mode Acak (Shuffle) Aktif' : 'Mode Acak Dimatikan');
  };
  elements.btnShuffle?.addEventListener('click', toggleShuffle);
  elements.drawerBtnShuffle?.addEventListener('click', toggleShuffle);

  const toggleRepeat = () => {
    repeatMode = (repeatMode + 1) % 3;
    updateRepeatUI();
  };
  elements.btnRepeat?.addEventListener('click', toggleRepeat);
  elements.drawerBtnRepeat?.addEventListener('click', toggleRepeat);

  // Seekbar scrubbers
  const handleSeek = (e) => {
    const percent = parseFloat(e.target.value);
    if (audioEngine.audio.duration) {
      audioEngine.seek((percent / 100) * audioEngine.audio.duration);
    }
  };
  elements.progressBar?.addEventListener('input', handleSeek);
  elements.drawerProgressBar?.addEventListener('input', handleSeek);
  elements.deckProgressBar?.addEventListener('input', handleSeek);

  // Volume Bar & Faders
  const handleVolumeChange = (val) => {
    audioEngine.setVolume(val);
    elements.volumeBar.value = val;
    if (elements.deckVolumeFader) elements.deckVolumeFader.value = val;
    if (elements.deckVolLabel) elements.deckVolLabel.textContent = `${Math.round(val * 100)}%`;
    updateVolumeIcon(val);
  };

  elements.volumeBar?.addEventListener('input', (e) => handleVolumeChange(parseFloat(e.target.value)));
  elements.deckVolumeFader?.addEventListener('input', (e) => handleVolumeChange(parseFloat(e.target.value)));

  elements.btnMute?.addEventListener('click', () => {
    if (audioEngine.getVolume() > 0) {
      handleVolumeChange(0);
    } else {
      handleVolumeChange(0.8);
    }
  });

  // MP3 Deck Speed Buttons
  elements.deckSpeedBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.deckSpeedBtns.forEach(b => {
        b.className = 'deck-speed-btn py-1 rounded bg-dark-900 text-slate-400 hover:text-white';
      });
      btn.className = 'deck-speed-btn py-1 rounded bg-brand-500 text-white';
      const speed = parseFloat(btn.dataset.speed);
      audioEngine.setPlaybackRate(speed);
      if (elements.deckSpeedLabel) elements.deckSpeedLabel.textContent = `${speed}x`;
      showToast(`Kecepatan Putar: ${speed}x`);
    });
  });

  // Drawer Open / Close
  elements.btnExpandPlayer?.addEventListener('click', () => elements.drawerPlayer?.classList.remove('translate-y-full'));
  elements.btnFullviewToggle?.addEventListener('click', () => elements.drawerPlayer?.classList.remove('translate-y-full'));
  elements.btnCollapsePlayer?.addEventListener('click', () => elements.drawerPlayer?.classList.add('translate-y-full'));

  // Drawer Favorite
  elements.drawerBtnFavorite?.addEventListener('click', async () => {
    if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
      const song = playlist[currentTrackIndex];
      const updated = await toggleFavorite(song.id);
      song.isFavorite = updated ? 1 : 0;
      updateDrawerFavButton(updated);
      refreshLibrary();
    }
  });

  // Drawer Lyrics
  const toggleDrawerLyrics = () => elements.drawerLyricsContainer?.classList.toggle('hidden');
  elements.btnQuickLyrics?.addEventListener('click', () => {
    elements.drawerPlayer?.classList.remove('translate-y-full');
    elements.drawerLyricsContainer?.classList.remove('hidden');
  });
  elements.drawerToggleLyrics?.addEventListener('click', toggleDrawerLyrics);
  elements.deckBtnOpenLyrics?.addEventListener('click', () => {
    elements.drawerPlayer?.classList.remove('translate-y-full');
    elements.drawerLyricsContainer?.classList.remove('hidden');
  });

  // Modals Openers
  elements.btnOpenDownloader?.addEventListener('click', () => openModal(elements.modalDownloader));
  elements.btnEmptyAdd?.addEventListener('click', () => openModal(elements.modalDownloader));
  elements.btnOpenEq?.addEventListener('click', () => openModal(elements.modalEq));
  elements.drawerToggleEq?.addEventListener('click', () => openModal(elements.modalEq));
  elements.deckBtnOpenEq?.addEventListener('click', () => openModal(elements.modalEq));
  elements.btnOpenSleepTimer?.addEventListener('click', () => openModal(elements.modalSleepTimer));
  elements.drawerToggleSleepTimer?.addEventListener('click', () => openModal(elements.modalSleepTimer));
  elements.btnOpenSettings?.addEventListener('click', () => switchView('settings'));

  // Modal Closers
  elements.modalCloses?.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.glass-modal').forEach(m => closeModal(m.closest('.fixed')));
    });
  });

  // Downloader Tab Switch
  elements.tabDlCloud?.addEventListener('click', () => {
    elements.tabDlCloud.className = 'flex-1 py-2 text-xs font-semibold rounded-lg bg-brand-500 text-white transition';
    elements.tabDlLocal.className = 'flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition';
    elements.sectionDlCloud?.classList.remove('hidden');
    elements.sectionDlLocal?.classList.add('hidden');
  });

  elements.tabDlLocal?.addEventListener('click', () => {
    elements.tabDlLocal.className = 'flex-1 py-2 text-xs font-semibold rounded-lg bg-brand-500 text-white transition';
    elements.tabDlCloud.className = 'flex-1 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 transition';
    elements.sectionDlLocal?.classList.remove('hidden');
    elements.sectionDlCloud?.classList.add('hidden');
  });

  elements.btnStartDownload?.addEventListener('click', handleCloudDownload);

  // Quick Hero Downloader Handlers & Clipboard Paste (Sangat Mudah Dipahami)
  const heroQuickUrl = document.getElementById('hero-quick-url');
  const btnHeroPaste = document.getElementById('btn-hero-paste');
  const btnHeroDownload = document.getElementById('btn-hero-download');
  const btnModalPaste = document.getElementById('btn-modal-paste');

  const pasteToInput = async (targetInput) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && targetInput) {
        targetInput.value = text.trim();
        showToast('Link berhasil ditempel dari clipboard!');
        targetInput.focus();
      } else {
        showToast('Clipboard kosong. Silakan copy link TikTok / YouTube terlebih dahulu.');
      }
    } catch (e) {
      showToast('Gunakan klik kanan / tahan layar lalu pilih Tempel.');
    }
  };

  btnHeroPaste?.addEventListener('click', () => pasteToInput(heroQuickUrl));
  btnModalPaste?.addEventListener('click', () => pasteToInput(elements.inputDlUrl));

  const triggerHeroDownload = () => {
    const val = heroQuickUrl?.value.trim();
    if (!val) {
      showToast('Mohon masukkan atau tempel link TikTok atau YouTube.');
      heroQuickUrl?.focus();
      return;
    }
    if (elements.inputDlUrl) elements.inputDlUrl.value = val;
    openModal(elements.modalDownloader);
    heroQuickUrl.value = '';
    handleCloudDownload();
  };

  btnHeroDownload?.addEventListener('click', triggerHeroDownload);
  heroQuickUrl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerHeroDownload();
    }
  });

  // Local File Upload & Global Drag-Drop
  elements.btnBrowseFiles?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput?.click();
  });
  elements.dropZone?.addEventListener('click', (e) => {
    if (e.target === elements.fileInput || e.target.closest('#btn-browse-files')) return;
    elements.fileInput?.click();
  });
  elements.fileInput?.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleLocalFiles(e.target.files);
      e.target.value = ''; // Reset input agar file yang sama bisa dipilih ulang jika perlu
    }
  });
  elements.btnSyncAllGdrive?.addEventListener('click', async () => {
    await syncCatalogFromGoogleDrive(true);
    await syncPendingSongsToGDrive(true);
  });

  // Global Drag & Drop onto the browser window
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (elements.globalDropOverlay) {
      elements.globalDropOverlay.classList.remove('hidden');
      elements.globalDropOverlay.classList.add('flex');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 && elements.globalDropOverlay) {
      dragCounter = 0;
      elements.globalDropOverlay.classList.add('hidden');
      elements.globalDropOverlay.classList.remove('flex');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (elements.globalDropOverlay) {
      elements.globalDropOverlay.classList.add('hidden');
      elements.globalDropOverlay.classList.remove('flex');
    }
    if (e.dataTransfer?.files?.length) {
      handleLocalFiles(e.dataTransfer.files);
    }
  });

  // Modal Dropzone specific drag styles
  elements.dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('border-brand-500', 'bg-brand-500/10');
  });
  elements.dropZone?.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('border-brand-500', 'bg-brand-500/10');
  });
  elements.dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('border-brand-500', 'bg-brand-500/10');
    if (e.dataTransfer?.files?.length) {
      handleLocalFiles(e.dataTransfer.files);
    }
  });

  // Wishlist Add Form
  elements.btnAddWishlist?.addEventListener('click', async () => {
    const url = elements.inputWishlistUrl?.value.trim();
    if (!url) {
      showToast('Masukkan link Google Drive, GitHub, atau URL audio terlebih dahulu.');
      return;
    }

    const title = elements.inputWishlistTitle?.value.trim() || 'Lagu dari Link';
    const artist = elements.inputWishlistArtist?.value.trim() || 'Unknown Artist';

    await addToWishlist({ title, artist, url, status: 'pending' });

    elements.inputWishlistUrl.value = '';
    elements.inputWishlistTitle.value = '';
    elements.inputWishlistArtist.value = '';

    showToast('Lagu berhasil ditambahkan ke Wishlist!');
    await refreshWishlist();

    // Jika online, otomatis unduh langsung!
    if (navigator.onLine && elements.settingAutoDl?.checked !== false) {
      processWishlistQueue();
    }
  });

  // Sync / Download All Wishlist button
  elements.btnSyncAllWishlist?.addEventListener('click', () => {
    if (!navigator.onLine) {
      showToast('Perangkat sedang offline. Sambungkan internet untuk mengunduh.');
      return;
    }
    processWishlistQueue();
  });

  // Equalizer Presets
  document.querySelectorAll('.eq-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.eq-preset-btn').forEach(b => {
        b.className = 'eq-preset-btn px-2 py-1.5 rounded-lg text-xs font-semibold bg-dark-900 text-slate-400 hover:text-slate-200 text-center transition';
      });
      btn.className = 'eq-preset-btn px-2 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white text-center transition';
      const preset = btn.dataset.preset;
      const gains = audioEngine.applyEqPreset(preset);
      document.querySelectorAll('.eq-slider').forEach((slider, idx) => {
        slider.value = gains[idx] || 0;
      });
      showToast(`Equalizer Preset: ${btn.textContent}`);
    });
  });

  document.querySelectorAll('.eq-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      audioEngine.setEqGain(parseInt(e.target.dataset.band, 10), parseFloat(e.target.value));
    });
  });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => {
        b.className = 'speed-btn py-1.5 rounded-lg text-xs font-semibold bg-dark-900 text-slate-400 hover:text-white transition';
      });
      btn.className = 'speed-btn py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white transition';
      const speed = parseFloat(btn.dataset.speed);
      audioEngine.setPlaybackRate(speed);
      showToast(`Kecepatan: ${speed}x`);
    });
  });

  // Sleep Timer
  elements.timerOptBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.mins, 10);
      elements.badgeTimer?.classList.remove('hidden');
      if (elements.badgeTimer) elements.badgeTimer.textContent = `${mins}m`;

      audioEngine.setSleepTimer(
        mins,
        (remainingSeconds) => {
          const m = Math.floor(remainingSeconds / 60);
          const s = remainingSeconds % 60;
          if (elements.badgeTimer) elements.badgeTimer.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        },
        () => {
          elements.badgeTimer?.classList.add('hidden');
          showToast('Waktu habis, lagu berhenti otomatis.');
        }
      );

      closeModal(elements.modalSleepTimer);
      showToast(`Sleep timer diatur untuk ${mins} menit.`);
    });
  });

  elements.btnCancelTimer?.addEventListener('click', () => {
    audioEngine.clearSleepTimer();
    elements.badgeTimer?.classList.add('hidden');
    closeModal(elements.modalSleepTimer);
    showToast('Sleep timer dibatalkan.');
  });

  // Settings: Google Drive Folder Save
  elements.settingGdriveFolder?.addEventListener('change', async (e) => {
    await setSetting('gdrive_folder', e.target.value.trim());
    showToast('Folder Google Drive default diperbarui.');
  });

  // Settings: Export JSON
  const handleExport = async () => {
    const data = await exportLibraryMetadata();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ATune_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Metadata dan Playlist berhasil diekspor.');
  };
  elements.btnExportDb?.addEventListener('click', handleExport);
  elements.btnSettingsExport?.addEventListener('click', handleExport);

  // Settings: Clear DB
  const handleClear = async () => {
    if (confirm('PERINGATAN: Semua lagu yang tersimpan offline akan dihapus dari perangkat ini. Lanjutkan?')) {
      await db.songs.clear();
      audioEngine.pause();
      currentTrackIndex = -1;
      resetPlayerUI();
      closeModal(elements.modalSettings);
      showToast('Database offline telah dibersihkan.');
      refreshLibrary();
      updateStorageDisplay();
    }
  };
  elements.btnClearAll?.addEventListener('click', handleClear);
  elements.btnSettingsClear?.addEventListener('click', handleClear);

  // Settings: Clear Site Cookies & Cache
  const handleClearCookies = () => {
    if (confirm('Hapus seluruh cookie dan data sesi browser khusus untuk web ini?')) {
      const cookies = document.cookie.split(";");
      let count = 0;
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        if (name) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=;`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${window.location.hostname}; path=/;`;
          count++;
        }
      }
      sessionStorage.clear();
      showToast(`Cookie & sesi web ini (${count} item) telah berhasil dihapus!`);
    }
  };

  const handleClearSiteCache = async () => {
    if (confirm('Hapus cookie, sesi, dan cache browser khusus web ini lalu muat ulang?')) {
      // 1. Clear cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        if (name) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=;`;
        }
      }
      sessionStorage.clear();

      // 2. Clear caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      showToast('Seluruh cookie dan cache web ini telah dibersihkan! Memuat ulang...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  document.getElementById('btn-clear-site-cookies')?.addEventListener('click', handleClearCookies);
  document.getElementById('btn-clear-site-cache')?.addEventListener('click', handleClearSiteCache);
  document.getElementById('btn-modal-clear-cookies')?.addEventListener('click', handleClearSiteCache);

  // Settings: Google Apps Script Webhook URL & Copy Code
  const inputGasUrl = document.getElementById('setting-gas-url');
  const btnSaveGasUrl = document.getElementById('btn-save-gas-url');
  const gasStatusBadge = document.getElementById('gas-status-badge');
  const btnCopyGasCode = document.getElementById('btn-copy-gas-code');

  const updateGasBadge = (url) => {
    if (gasStatusBadge) {
      if (url && url.startsWith('http')) {
        gasStatusBadge.textContent = 'Terhubung ke Drive';
        gasStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else {
        gasStatusBadge.textContent = 'Siap Dihubungkan';
        gasStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      }
    }
  };

  getGasWebhookUrl().then(savedGasUrl => {
    if (inputGasUrl && savedGasUrl) {
      inputGasUrl.value = savedGasUrl;
      updateGasBadge(savedGasUrl);
    }
  });

  btnSaveGasUrl?.addEventListener('click', async () => {
    const val = inputGasUrl?.value.trim() || '';
    await setGasWebhookUrl(val);
    updateGasBadge(val);
    showToast(val ? 'Webhook Google Apps Script berhasil disimpan!' : 'URL Webhook dikosongkan.');
  });

  btnCopyGasCode?.addEventListener('click', () => {
    const gasCode = `/**
 * Google Apps Script - Aura Music Bridge (Hardened Security)
 * Folder: 1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU
 */
const TARGET_FOLDER_ID = '1BcMu2RPS-ywwClvbArZl8AX_xXiwv4DU';
const AURA_APP_TOKEN = 'aura_secure_token_9a8f4c2e7b1d';
const MAX_FILE_SIZE_BYTES = 35 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['audio/mpeg','audio/mp3','audio/x-m4a','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/flac','audio/webm'];

function doGet(e) {
  try {
    const catalog = getFolderSongsCatalog();
    return ContentService.createTextOutput(JSON.stringify({ status: 'active', totalSongs: catalog.length, songs: catalog })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', songs: [] })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'preflight_ok' })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    const payload = JSON.parse(e.postData.contents);
    if (payload.token !== AURA_APP_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', code: 401, message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'list') {
      const catalog = getFolderSongsCatalog();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', songs: catalog })).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'delete') {
      try {
        DriveApp.getFileById(payload.fileId).setTrashed(true);
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'File dihapus dari Drive' })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'File sudah tidak ada' })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const cache = CacheService.getScriptCache();
    const rateKey = 'ratelimit_' + (payload.clientFingerprint || 'anon');
    const count = parseInt(cache.get(rateKey) || '0', 10);
    if (count >= 120) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', code: 429, message: 'Rate limit exceeded' })).setMimeType(ContentService.MimeType.JSON);
    }
    cache.put(rateKey, (count + 1).toString(), 300);

    const rawMime = (payload.mimeType || 'audio/mpeg').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.includes(rawMime)) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', code: 415, message: 'Unsupported MIME' })).setMimeType(ContentService.MimeType.JSON);
    }
    const safeFilename = (payload.filename || 'song.mp3').replace(/[/\\\\?%*:|"<>]/g, '_').slice(0, 100);
    const decodedBytes = Utilities.base64Decode(payload.base64Data);
    if (decodedBytes.length > MAX_FILE_SIZE_BYTES) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', code: 413, message: 'File too large' })).setMimeType(ContentService.MimeType.JSON);
    }

    let folder;
    try { folder = DriveApp.getFolderById(TARGET_FOLDER_ID); } catch (fErr) { folder = DriveApp.getRootFolder(); }

    const existing = folder.getFilesByName(safeFilename);
    if (existing.hasNext()) {
      const ex = existing.next();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', duplicate: true, fileId: ex.getId(), downloadUrl: ex.getDownloadUrl(), webViewLink: ex.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }

    const file = folder.createFile(Utilities.newBlob(decodedBytes, rawMime, safeFilename));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', fileId: file.getId(), downloadUrl: file.getDownloadUrl(), webViewLink: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getFolderSongsCatalog() {
  let folder;
  try { folder = DriveApp.getFolderById(TARGET_FOLDER_ID); } catch (e) { folder = DriveApp.getRootFolder(); }
  const files = folder.getFiles();
  const list = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.isTrashed()) continue;
    const name = f.getName();
    let title = name.replace(/\\.[^/.]+$/, ''), artist = 'Google Drive';
    if (title.includes(' - ')) { const p = title.split(' - '); artist = p[0].trim(); title = p.slice(1).join(' - ').trim(); }
    list.push({ fileId: f.getId(), title, artist, fileName: name, directStreamUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId(), webViewLink: f.getUrl() });
  }
  return list;
}`;
    navigator.clipboard.writeText(gasCode).then(() => {
      showToast('Kode Google Apps Script yang diamankan disalin ke clipboard!');
    }).catch(() => {
      showToast('Buka file gdrive-bridge/Code.gs untuk menyalin.');
    });
  });
}

// ======================== DOWNLOADER HANDLERS ========================
let lastDownloadClick = 0;

async function handleCloudDownload() {
  const now = Date.now();
  if (now - lastDownloadClick < 2000) {
    showToast('Mohon tunggu sebentar sebelum memproses link berikutnya.');
    return;
  }
  lastDownloadClick = now;

  const url = elements.inputDlUrl?.value.trim();
  if (!url) {
    showToast('Mohon masukkan URL TikTok, YouTube, Google Drive, atau link audio.');
    return;
  }

  if (!validateSafeUrl(url)) {
    showToast('Keamanan: Link ditolak. Mohon gunakan URL publik yang sah (https://).');
    return;
  }

  const title = elements.inputDlTitle?.value.trim();
  const artist = elements.inputDlArtist?.value.trim();

  elements.dlProgressBox?.classList.remove('hidden');
  if (elements.dlProgressBar) elements.dlProgressBar.style.width = '10%';
  if (elements.dlStatusText) {
    elements.dlStatusText.innerHTML = `
      <svg class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-brand-400 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <span>Memvalidasi keamanan link...</span>
    `;
  }
  if (elements.dlPercentText) elements.dlPercentText.textContent = '10%';
  if (elements.btnStartDownload) elements.btnStartDownload.disabled = true;

  try {
    const result = await downloadAndSaveSong(url, { title, artist }, (statusText, percent) => {
      if (elements.dlProgressBar) elements.dlProgressBar.style.width = `${percent}%`;
      if (elements.dlPercentText) elements.dlPercentText.textContent = `${percent}%`;
      if (elements.dlStatusText) {
        elements.dlStatusText.innerHTML = `
          <svg class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-brand-400 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <span>${statusText}</span>
        `;
      }
    });

    if (elements.dlProgressBar) elements.dlProgressBar.style.width = '100%';
    if (elements.dlPercentText) elements.dlPercentText.textContent = '100%';
    if (elements.dlStatusText) {
      elements.dlStatusText.innerHTML = `
        <svg class="h-3.5 w-3.5 text-emerald-400 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        <span>Selesai & tersimpan offline!</span>
      `;
    }

    if (result && result.gdriveUpload && result.gdriveUpload.status === 'success') {
      showToast(`"${result.title}" tersimpan offline & masuk ke Google Drive!`);
    } else {
      showToast(`"${result?.title || 'Lagu'}" berhasil disimpan ke database offline!`);
    }
    
    if (elements.inputDlUrl) elements.inputDlUrl.value = '';
    if (elements.inputDlTitle) elements.inputDlTitle.value = '';
    if (elements.inputDlArtist) elements.inputDlArtist.value = '';

    setTimeout(() => {
      closeModal(elements.modalDownloader);
      elements.dlProgressBox?.classList.add('hidden');
      if (elements.btnStartDownload) elements.btnStartDownload.disabled = false;
      refreshLibrary();
      updateStorageDisplay();
    }, 1200);

  } catch (err) {
    console.warn('Download notice:', err.message);
    
    const isYt = url.includes('youtube.com') || url.includes('youtu.be');
    const friendlyMsg = isYt 
      ? 'YouTube membatasi bot/kuota server publik saat ini. Link otomatis disimpan ke Wishlist. Rekomendasi: Gunakan link TikTok atau Import file MP3 langsung.'
      : (err.message || 'Gagal memproses link.');

    if (elements.dlStatusText) {
      elements.dlStatusText.innerHTML = `
        <span class="text-rose-400 text-xs">${friendlyMsg}</span>
      `;
    }
    if (elements.btnStartDownload) elements.btnStartDownload.disabled = false;

    // Jika YouTube diblokir bot, otomatis amankan link ke Wishlist agar pengguna tidak kehilangan link
    if (isYt) {
      try {
        await addToWishlist({
          title: title || 'YouTube Track (Antrean)',
          artist: artist || 'YouTube',
          url: url,
          status: 'failed',
          error: 'Dibatasi bot YouTube'
        });
        await refreshWishlist();
      } catch (e) {}
    }

    showToast(friendlyMsg);
  }
}

let isSyncingCatalog = false;

/**
 * Menyinkronkan katalog lagu dari Google Drive ke database perangkat ini
 * Menjadikan seluruh isi web yang diakses di HP, laptop, atau perangkat lain persis sama
 */
export async function syncCatalogFromGoogleDrive(showToastNotice = false) {
  if (isSyncingCatalog) return;
  if (!navigator.onLine) {
    if (showToastNotice) showToast('Perangkat sedang offline. Sambungkan internet untuk sinkronisasi.');
    return;
  }

  isSyncingCatalog = true;
  try {
    if (showToastNotice) showToast('Menghubungi Google Drive untuk menyinkronkan daftar lagu...');
    const driveSongs = await fetchDriveSharedCatalog();

    if (driveSongs && driveSongs.length > 0) {
      const localSongs = await getAllSongs();
      let newSongsCount = 0;

      for (const dSong of driveSongs) {
        const cleanTitle = (dSong.title || '').trim().toLowerCase();
        const cleanArtist = (dSong.artist || '').trim().toLowerCase();

        const existing = localSongs.find(l => 
          (l.gdriveFileId && l.gdriveFileId === dSong.fileId) ||
          (l.title?.trim().toLowerCase() === cleanTitle && 
           (l.artist?.trim().toLowerCase() === cleanArtist || l.artist === 'Google Drive' || !l.artist))
        );

        if (!existing) {
          // Tambahkan lagu baru dari Google Drive ke database perangkat ini
          await saveSong({
            title: dSong.title,
            artist: dSong.artist,
            album: dSong.album || 'Google Drive Cloud',
            duration: 0,
            audioBlob: null, // Streaming on-demand, cache otomatis saat diputar
            mimeType: dSong.mimeType || 'audio/mpeg',
            coverArtBlob: null,
            lyrics: '',
            source: 'gdrive',
            sourceUrl: dSong.directStreamUrl,
            gdriveStatus: 'synced',
            gdriveFileId: dSong.fileId,
            gdriveUrl: dSong.webViewLink
          });
          newSongsCount++;
        } else {
          // Perbarui fileId & status jika belum lengkap
          if (!existing.gdriveFileId || existing.gdriveStatus !== 'synced') {
            await updateSong(existing.id, {
              gdriveFileId: dSong.fileId,
              gdriveStatus: 'synced',
              gdriveUrl: dSong.webViewLink,
              sourceUrl: existing.sourceUrl || dSong.directStreamUrl
            });
          }
        }
      }

      // Hapus dari lokal jika file di Google Drive sudah dihapus
      const driveFileIds = new Set(driveSongs.map(d => d.fileId));
      for (const lSong of localSongs) {
        if (lSong.source === 'gdrive' && lSong.gdriveFileId && !driveFileIds.has(lSong.gdriveFileId)) {
          await deleteSong(lSong.id);
          console.log(`[Sync] Menghapus "${lSong.title}" lokal karena sudah dihapus dari Google Drive.`);
        }
      }

      await refreshLibrary();
      if (showToastNotice || newSongsCount > 0) {
        showToast(`✓ Sinkronisasi Drive: ${driveSongs.length} lagu tersedia di semua perangkat!`);
      }
    } else {
      if (showToastNotice) showToast('Folder Google Drive terhubung (belum ada file audio).');
    }
  } catch (err) {
    console.warn('Gagal sinkronisasi katalog Google Drive:', err);
    if (showToastNotice) showToast('Gagal memuat katalog Google Drive.');
  } finally {
    isSyncingCatalog = false;
  }
}

let isSyncingDrive = false;

export async function syncPendingSongsToGDrive(showUserFeedback = false) {
  if (isSyncingDrive) return;
  if (!navigator.onLine) {
    if (showUserFeedback) showToast('Perangkat sedang offline. Sambungkan internet untuk sinkronisasi ke Drive.');
    return;
  }

  const allSongs = await getAllSongs();
  const unsyncedSongs = allSongs.filter(s => s.gdriveStatus !== 'synced' && s.source !== 'gdrive');

  if (unsyncedSongs.length === 0) {
    if (showUserFeedback) showToast('Semua lagu offline sudah tersinkron rapi di Google Drive!');
    return;
  }

  isSyncingDrive = true;
  if (showUserFeedback) showToast(`Menyiapkan upload ${unsyncedSongs.length} lagu ke Google Drive...`);

  let successCount = 0;
  for (let i = 0; i < unsyncedSongs.length; i++) {
    const song = unsyncedSongs[i];
    if (showUserFeedback) {
      showToast(`☁️ Mengunggah (${i + 1}/${unsyncedSongs.length}): ${song.title}...`);
    }

    try {
      const res = await uploadAudioToGDrive(song.audioBlob, {
        title: song.title,
        artist: song.artist,
        sourceUrl: song.sourceUrl || 'sync_queue'
      });

      if (res && res.status === 'success') {
        await updateSong(song.id, {
          gdriveStatus: 'synced',
          gdriveFileId: res.fileId,
          gdriveUrl: res.webViewLink
        });
        song.gdriveStatus = 'synced';
        song.gdriveUrl = res.webViewLink;
        successCount++;
      }
    } catch (err) {
      console.warn('Gagal sinkron lagu ke Drive:', song.title, err);
    }
  }

  isSyncingDrive = false;
  refreshLibrary();
  if (showUserFeedback || successCount > 0) {
    showToast(`✓ Berhasil! ${successCount} dari ${unsyncedSongs.length} lagu telah diunggah ke Google Drive.`);
  }
}

async function handleLocalFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  elements.localUploadStatus?.classList.remove('hidden');
  let savedCount = 0;
  let driveUploadedCount = 0;

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg)$/i.test(file.name)) continue;

    if (elements.localUploadStatus) {
      elements.localUploadStatus.textContent = `Menganalisis file (${i + 1}/${fileList.length}): ${file.name}...`;
    }

    try {
      const metadata = await parseAudioMetadata(file);
      const cleanTitle = (metadata.title || file.name.replace(/\.[^/.]+$/, '')).trim().toLowerCase();
      const cleanArtist = (metadata.artist || 'Unknown').trim().toLowerCase();

      // Cek apakah lagu yang sama sudah ada di perpustakaan (cukup 1 saja)
      const allSongs = await getAllSongs();
      const existingSong = allSongs.find(s => 
        s.title?.trim().toLowerCase() === cleanTitle && 
        (s.artist?.trim().toLowerCase() === cleanArtist || s.artist === 'Unknown Artist')
      );

      let songId;
      if (existingSong) {
        songId = existingSong.id;
        // Jika sudah tersimpan dan sudah masuk Google Drive, lewati duplikasi!
        if (existingSong.gdriveStatus === 'synced' && existingSong.gdriveFileId) {
          showToast(`"${metadata.title}" sudah ada di perpustakaan & Google Drive (cukup 1 saja).`);
          continue;
        }
      } else {
        songId = await saveSong({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration,
          audioBlob: file,
          mimeType: file.type || 'audio/mpeg',
          coverArtBlob: metadata.coverArtBlob,
          lyrics: metadata.lyrics,
          source: 'local',
          gdriveStatus: navigator.onLine ? 'uploading' : 'pending'
        });
        savedCount++;
        refreshLibrary();
      }

      // Otomatis unggah ke Google Drive setiap kali file di-upload (cukup 1 saja)
      if (navigator.onLine) {
        if (elements.localUploadStatus) {
          elements.localUploadStatus.textContent = `Mengunggah ke Google Drive (${i + 1}/${fileList.length}): ${metadata.title}...`;
        }
        showToast(`☁️ Mengunggah "${metadata.title}" ke Google Drive...`);
        try {
          const driveRes = await uploadAudioToGDrive(file, {
            title: metadata.title,
            artist: metadata.artist,
            sourceUrl: 'local_upload'
          });
          if (driveRes && driveRes.status === 'success') {
            driveUploadedCount++;
            await updateSong(songId, {
              gdriveStatus: 'synced',
              gdriveFileId: driveRes.fileId,
              gdriveUrl: driveRes.webViewLink
            });
            console.log(`[Google Drive] "${metadata.title}" berhasil diunggah:`, driveRes.webViewLink);
            if (driveRes.duplicate) {
              showToast(`✓ "${metadata.title}" sudah ada di Google Drive (duplikasi dicegah).`);
            } else {
              showToast(`✓ "${metadata.title}" aman di Google Drive!`);
            }
          } else {
            await updateSong(songId, { gdriveStatus: 'pending' });
          }
        } catch (driveErr) {
          console.warn('Gagal auto-upload ke Drive:', driveErr.message);
          await updateSong(songId, { gdriveStatus: 'pending' });
        }
      } else {
        await updateSong(songId, { gdriveStatus: 'pending' });
      }
    } catch (err) {
      console.warn('Error saving local file:', file.name, err);
    }
  }

  if (elements.localUploadStatus) {
    elements.localUploadStatus.textContent = `Selesai! ${savedCount} lagu tersimpan offline, ${driveUploadedCount} masuk ke Google Drive.`;
  }
  setTimeout(() => {
    elements.localUploadStatus?.classList.add('hidden');
    closeModal(elements.modalDownloader);
    refreshLibrary();
    updateStorageDisplay();
    showToast(`${savedCount} lagu disimpan offline & ${driveUploadedCount} berhasil masuk Google Drive!`);
  }, 1000);
}

// ======================== HELPERS ========================
function updateViewHeaders(tab) {
  if (!elements.viewTitle || !elements.viewSubtitle) return;
  if (tab === 'all') {
    elements.viewTitle.innerHTML = '<span>Daftar Lagu Tersimpan</span>';
    elements.viewSubtitle.textContent = 'Semua file tersimpan langsung di database offline perangkat Anda.';
  } else if (tab === 'favorites') {
    elements.viewTitle.innerHTML = '<span class="text-rose-400">Lagu Favorit</span>';
    elements.viewSubtitle.textContent = 'Koleksi lagu favorit yang sering Anda dengarkan.';
  } else if (tab === 'gdrive') {
    elements.viewTitle.innerHTML = '<span class="text-amber-400">Lagu dari Google Drive</span>';
    elements.viewSubtitle.textContent = 'Lagu yang diunduh dari link Google Drive ke penyimpanan offline.';
  } else if (tab === 'local') {
    elements.viewTitle.innerHTML = '<span class="text-cyan-400">Lagu dari File Lokal</span>';
    elements.viewSubtitle.textContent = 'Lagu yang diimpor dari galeri atau penyimpanan perangkat Anda.';
  }
}

function updateShuffleUI() {
  elements.btnShuffle?.classList.toggle('text-brand-400', isShuffle);
  elements.drawerBtnShuffle?.classList.toggle('text-brand-400', isShuffle);
}

function updateRepeatUI() {
  const isOne = repeatMode === 2;
  const isAll = repeatMode === 1;

  elements.btnRepeat?.classList.toggle('text-brand-400', repeatMode > 0);
  elements.drawerBtnRepeat?.classList.toggle('text-brand-400', repeatMode > 0);

  elements.repeatBadge?.classList.toggle('hidden', !isOne);
  elements.drawerRepeatBadge?.classList.toggle('hidden', !isOne);

  if (repeatMode === 0) showToast('Repeat: Off');
  else if (isAll) showToast('Repeat: Ulang Semua');
  else if (isOne) showToast('Repeat: Ulang 1 Lagu');
}

function updateVolumeIcon(val) {
  elements.iconVolHigh?.classList.toggle('hidden', val === 0);
  elements.iconVolMute?.classList.toggle('hidden', val > 0);
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('hidden');
  setTimeout(() => modalEl.classList.remove('opacity-0'), 10);
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('opacity-0');
  setTimeout(() => modalEl.classList.add('hidden'), 200);
}

function showToast(msg) {
  if (!elements.toast || !elements.toastMsg) return;
  elements.toastMsg.textContent = msg;
  elements.toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-x-32');
  setTimeout(() => {
    elements.toast?.classList.add('opacity-0', 'pointer-events-none', 'translate-x-32');
  }, 3200);
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start application
initApp();
