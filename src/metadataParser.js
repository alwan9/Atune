/**
 * Aura Music - Lightweight Pure JS ID3 Tag Parser
 * Mengekstrak Title, Artist, Album, dan Gambar Cover Art (APIC) dari file audio
 */

export async function parseAudioMetadata(file) {
  const result = {
    title: cleanFileName(file.name),
    artist: 'Unknown Artist',
    album: 'Single / Unknown Album',
    coverArtBlob: null,
    duration: 0,
    lyrics: ''
  };

  try {
    // 1. Dapatkan durasi audio menggunakan Audio element
    result.duration = await getAudioDuration(file);

    // 2. Baca buffer untuk ID3 tag
    const arrayBuffer = await file.slice(0, 512 * 1024).arrayBuffer(); // Baca header 512KB pertama
    const view = new DataView(arrayBuffer);

    // Cek ID3v2 signature "ID3"
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      const version = view.getUint8(3); // 3 for ID3v2.3, 4 for ID3v2.4
      const id3Size = readSynchsafeInt(view, 6);
      
      // Parse frames dalam tag
      let offset = 10;
      const maxOffset = Math.min(offset + id3Size, arrayBuffer.byteLength);

      while (offset < maxOffset - 10) {
        const frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );

        if (!/^[A-Z0-9]{4}$/.test(frameId)) {
          break; // Padding atau tag selesai
        }

        const frameSize = version === 4 
          ? readSynchsafeInt(view, offset + 4)
          : view.getUint32(offset + 4);

        if (frameSize <= 0 || offset + 10 + frameSize > arrayBuffer.byteLength) {
          break;
        }

        const frameDataOffset = offset + 10;

        if (frameId === 'TIT2') { // Title
          result.title = decodeTextFrame(view, frameDataOffset, frameSize) || result.title;
        } else if (frameId === 'TPE1') { // Artist
          result.artist = decodeTextFrame(view, frameDataOffset, frameSize) || result.artist;
        } else if (frameId === 'TALB') { // Album
          result.album = decodeTextFrame(view, frameDataOffset, frameSize) || result.album;
        } else if (frameId === 'USLT') { // Unsynchronized lyric
          result.lyrics = decodeLyricsFrame(view, frameDataOffset, frameSize);
        } else if (frameId === 'APIC') { // Cover Art
          const coverBlob = extractApicCover(view, frameDataOffset, frameSize);
          if (coverBlob) {
            result.coverArtBlob = coverBlob;
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca tag ID3 lengkap, menggunakan fallback:', err);
  }

  return result;
}

function cleanFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, '').replace(/^[0-9\s._-]+/, '').trim();
}

function readSynchsafeInt(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function decodeTextFrame(view, offset, size) {
  try {
    const encoding = view.getUint8(offset);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 1, size - 1);
    
    if (encoding === 1 || encoding === 2) {
      // UTF-16
      const decoder = new TextDecoder('utf-16');
      return decoder.decode(bytes).replace(/\0.*$/g, '').trim();
    } else {
      // ISO-8859-1 or UTF-8
      const decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1');
      return decoder.decode(bytes).replace(/\0.*$/g, '').trim();
    }
  } catch {
    return '';
  }
}

function decodeLyricsFrame(view, offset, size) {
  try {
    const encoding = view.getUint8(offset);
    // Lewati language (3 bytes)
    const decoder = new TextDecoder(encoding === 1 ? 'utf-16' : 'utf-8');
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 4, size - 4);
    const text = decoder.decode(bytes);
    // Cari batas deskripsi lirik
    const splitIndex = text.indexOf('\0');
    return (splitIndex !== -1 ? text.substring(splitIndex + 1) : text).trim();
  } catch {
    return '';
  }
}

function extractApicCover(view, offset, size) {
  try {
    const encoding = view.getUint8(offset);
    let cur = offset + 1;
    
    // 1. Ekstrak MIME Type (null-terminated string)
    let mime = '';
    while (cur < offset + size) {
      const charCode = view.getUint8(cur);
      cur++;
      if (charCode === 0) break;
      mime += String.fromCharCode(charCode);
    }
    if (!mime || mime === '-->') mime = 'image/jpeg';

    // 2. Picture Type (1 byte)
    cur++;

    // 3. Description (null-terminated string according to encoding)
    if (encoding === 1 || encoding === 2) {
      while (cur < offset + size - 1) {
        if (view.getUint8(cur) === 0 && view.getUint8(cur + 1) === 0) {
          cur += 2;
          break;
        }
        cur += 2;
      }
    } else {
      while (cur < offset + size) {
        if (view.getUint8(cur) === 0) {
          cur++;
          break;
        }
        cur++;
      }
    }

    // 4. Sisa bytes adalah raw image data (JPEG atau PNG)
    const imgSize = size - (cur - offset);
    if (imgSize > 100) {
      const imgBytes = new Uint8Array(view.buffer, view.byteOffset + cur, imgSize);
      return new Blob([imgBytes], { type: mime });
    }
  } catch (err) {
    console.warn('Error reading APIC frame:', err);
  }
  return null;
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration || 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}
