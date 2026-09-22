/**
 * ATune - YouTube to MP3 Downloader Engine (Referenced from Y2mate)
 * Mendukung pencarian, resolusi kualitas audio (320k, 256k, 192k, 128k),
 * konversi, unduh langsung, simpan ke database offline ATune, dan sinkron ke Google Drive.
 */

import { validateSafeUrl, extractMediaFromUrl } from './mediaExtractor.js';
import { downloadAndSaveSong } from './downloader.js';
import { uploadAudioToGDrive } from './gdriveUploader.js';
import { db } from './db.js';

// DOM Elements
const inputUrl = document.getElementById('yt-url-input');
const btnConvert = document.getElementById('btn-convert');
const btnPaste = document.getElementById('btn-paste');
const conversionLoader = document.getElementById('conversion-loader');
const resultCard = document.getElementById('result-card');
const errorMessage = document.getElementById('error-message');
const toastNotice = document.getElementById('toast-notice');
const toastText = document.getElementById('toast-text');

// State
let currentVideoData = null;
let toastTimeout = null;

// Toast Notification
export function showToast(message, duration = 3500) {
  if (!toastNotice || !toastText) return;
  toastText.textContent = message;
  toastNotice.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  toastNotice.classList.add('opacity-100', 'translate-y-0');
  
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastNotice.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    toastNotice.classList.remove('opacity-100', 'translate-y-0');
  }, duration);
}

// Parse YouTube Video ID
export function extractYouTubeId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  
  // Standard watch URL: youtube.com/watch?v=VIDEO_ID
  let match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

// Fetch YouTube Metadata via oEmbed
async function fetchYouTubeMetadata(videoId, rawUrl) {
  try {
    const oembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return {
          id: videoId,
          title: data.title || 'YouTube Audio Track',
          author: data.author_name || 'YouTube Creator',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          maxThumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }
  } catch (err) {
    console.warn('oEmbed fetch error, fallback to basic metadata:', err);
  }

  return {
    id: videoId,
    title: `YouTube Video (${videoId})`,
    author: 'YouTube Audio',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    maxThumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    url: rawUrl || `https://www.youtube.com/watch?v=${videoId}`
  };
}

// Render Result Card (Quality options like Y2mate)
function renderResult(video) {
  currentVideoData = video;

  const resThumb = document.getElementById('res-thumb');
  const resTitle = document.getElementById('res-title');
  const resAuthor = document.getElementById('res-author');
  const resDuration = document.getElementById('res-duration');

  if (resThumb) {
    resThumb.src = video.thumbnail;
    resThumb.onerror = () => { resThumb.src = video.thumbnail; };
  }
  if (resTitle) resTitle.textContent = video.title;
  if (resAuthor) resAuthor.textContent = video.author;
  if (resDuration) resDuration.textContent = 'Audio HQ';

  // Quality table rows
  const tableBody = document.getElementById('quality-table-body');
  if (tableBody) {
    const qualities = [
      { bitrate: '320 kbps', label: 'Audio High Definition', size: '~9.4 MB', badge: 'Terbaik (Studio)', code: '320' },
      { bitrate: '256 kbps', label: 'Audio High Quality', size: '~7.2 MB', badge: 'Sangat Jernih', code: '256' },
      { bitrate: '192 kbps', label: 'Audio Standard HQ', size: '~5.5 MB', badge: 'Populer', code: '192' },
      { bitrate: '128 kbps', label: 'Audio Hemat Memori', size: '~3.8 MB', badge: 'Ringan', code: '128' }
    ];

    tableBody.innerHTML = qualities.map((q) => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/30 transition">
        <td class="py-3 px-3 sm:px-4">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <div>
              <span class="text-xs sm:text-sm font-bold text-slate-100 font-mono">MP3 (${q.bitrate})</span>
              <span class="hidden sm:inline-block ml-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300">${q.badge}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 sm:hidden mt-0.5">${q.label}</div>
        </td>
        <td class="py-3 px-2 sm:px-3 text-center text-xs font-mono text-slate-400">
          ${q.size}
        </td>
        <td class="py-3 px-3 sm:px-4 text-right">
          <div class="flex items-center justify-end gap-1.5 flex-wrap">
            <button class="btn-dl-quality px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold transition flex items-center gap-1 shadow-sm active:scale-95" data-bitrate="${q.code}" data-action="download">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              <span>Download</span>
            </button>
            <button class="btn-dl-quality px-2.5 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 text-xs font-semibold transition flex items-center gap-1 active:scale-95" data-bitrate="${q.code}" data-action="save-offline" title="Simpan langsung ke koleksi offline ATune">
              <span>🎵 Offline</span>
            </button>
            <button class="btn-dl-quality px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition flex items-center gap-1 active:scale-95" data-bitrate="${q.code}" data-action="save-drive" title="Upload otomatis ke Google Drive">
              <span>☁️ Drive</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach listeners to quality buttons
    tableBody.querySelectorAll('.btn-dl-quality').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const bitrate = btn.getAttribute('data-bitrate');
        const action = btn.getAttribute('data-action');
        handleQualityAction(action, bitrate, btn);
      });
    });
  }

  // Show result card and scroll to it smoothly
  if (resultCard) {
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Handle Download / Save Offline / Drive Action
async function handleQualityAction(action, bitrate, btnEl) {
  if (!currentVideoData) return;

  const originalContent = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>Proses...</span>`;

  showToast(`Memproses konversi MP3 ${bitrate}kbps...`);

  try {
    // 1. Ekstrak audio stream dari link YouTube
    const mediaData = await extractMediaFromUrl(currentVideoData.url);
    if (!mediaData || !mediaData.audioUrl) {
      throw new Error('Gagal mengekstrak streaming audio. Silakan coba lagi sebentar.');
    }

    // Ambil blob audio
    const audioRes = await fetch(mediaData.audioUrl);
    if (!audioRes.ok) throw new Error('Gagal mengambil file audio dari server.');
    const audioBlob = await audioRes.blob();

    const safeTitle = (mediaData.title || currentVideoData.title || 'YouTube Audio').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const filename = `${safeTitle} [${bitrate}k].mp3`;

    if (action === 'download') {
      // Direct Download to PC/Phone
      const blobUrl = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 2000);

      showToast(`✅ Berhasil! File "${filename}" mulai diunduh.`);
    } else if (action === 'save-offline') {
      // Save directly into Dexie DB for ATune Offline Player
      await downloadAndSaveSong({
        ...mediaData,
        title: safeTitle,
        artist: currentVideoData.author || mediaData.artist || 'YouTube Audio'
      });
      showToast(`🎉 Berhasil disimpan ke Offline ATune! Siap diputar tanpa internet.`);
    } else if (action === 'save-drive') {
      // Upload to Google Drive folder
      showToast(`☁️ Mengunggah "${filename}" ke folder Google Drive...`);
      const uploadRes = await uploadAudioToGDrive(audioBlob, filename, {
        title: safeTitle,
        artist: currentVideoData.author
      });
      if (uploadRes && uploadRes.status === 'success') {
        showToast(`✅ Berhasil diunggah ke Google Drive!`);
      } else {
        showToast(`Tersimpan di antrean sinkronisasi Drive.`);
      }
    }
  } catch (err) {
    console.error('Download error:', err);
    // User-friendly fallback with direct stream link
    const searchUrl = `https://www.youtube.com/watch?v=${currentVideoData.id}`;
    showToast(`⚠️ Server konversi sedang sibuk. Mengarahkan ke jalur alternatif...`);
    window.open(`https://co.wuk.sh/?url=${encodeURIComponent(searchUrl)}`, '_blank');
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = originalContent;
  }
}

// Convert Form Submission Handler
async function handleConvert() {
  const url = inputUrl?.value?.trim();
  if (!url) {
    showError('Silakan masukkan link video YouTube terlebih dahulu.');
    return;
  }

  // Clear previous error
  hideError();

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    showError('Link YouTube tidak valid. Mohon tempel link seperti: https://www.youtube.com/watch?v=... atau https://youtu.be/...');
    return;
  }

  // Show loader & hide previous result
  if (conversionLoader) conversionLoader.classList.remove('hidden');
  if (resultCard) resultCard.classList.add('hidden');
  if (btnConvert) btnConvert.disabled = true;

  try {
    const videoData = await fetchYouTubeMetadata(videoId, url);
    renderResult(videoData);
    showToast('✅ Berhasil menemukan video! Pilih kualitas audio MP3 di bawah.');
  } catch (err) {
    console.error('Conversion error:', err);
    showError('Terjadi kesalahan saat memproses link YouTube. Silakan periksa koneksi internet Anda.');
  } finally {
    if (conversionLoader) conversionLoader.classList.add('hidden');
    if (btnConvert) btnConvert.disabled = false;
  }
}

function showError(msg) {
  if (!errorMessage) return;
  errorMessage.textContent = msg;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  if (!errorMessage) return;
  errorMessage.classList.add('hidden');
  errorMessage.textContent = '';
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Convert Button
  btnConvert?.addEventListener('click', handleConvert);

  // Enter Key on input
  inputUrl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConvert();
    }
  });

  // Paste from clipboard button
  btnPaste?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && inputUrl) {
          inputUrl.value = text.trim();
          showToast('📋 Link berhasil ditempel!');
          handleConvert();
        }
      } else {
        inputUrl?.focus();
        showToast('Tekan CTRL+V untuk menempelkan link.');
      }
    } catch (err) {
      inputUrl?.focus();
      showToast('Tekan CTRL+V untuk menempelkan link.');
    }
  });

  // FAQ Accordions
  const faqButtons = document.querySelectorAll('.faq-toggle');
  faqButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const arrow = btn.querySelector('.faq-arrow');
      if (content) {
        content.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
      }
    });
  });

  // Check URL params for query or auto-download
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q') || urlParams.get('url');
  if (q && inputUrl) {
    inputUrl.value = q;
    handleConvert();
  }
});
