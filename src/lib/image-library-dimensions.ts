interface ImageSize {
  height: number;
  width: number;
}

const readPngDimensions = (view: DataView): ImageSize | null => {
  if (view.byteLength < 24) {
    return null;
  }

  // PNG signature + IHDR chunk
  if (
    view.getUint32(0) !== 0x89_50_4e_47 ||
    view.getUint32(4) !== 0x0d_0a_1a_0a
  ) {
    return null;
  }

  return {
    height: view.getUint32(20),
    width: view.getUint32(16),
  };
};

const isStandaloneJpegMarker = (marker: number): boolean =>
  marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

const isJpegSofMarker = (marker: number): boolean =>
  (marker >= 0xc0 && marker <= 0xc3) ||
  (marker >= 0xc5 && marker <= 0xc7) ||
  (marker >= 0xc9 && marker <= 0xcb) ||
  (marker >= 0xcd && marker <= 0xcf);

const readJpegDimensions = (view: DataView): ImageSize | null => {
  if (view.byteLength < 10 || view.getUint16(0) !== 0xff_d8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    if (isStandaloneJpegMarker(marker)) {
      offset += 2;
      continue;
    }

    const segmentLength = view.getUint16(offset + 2);

    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) {
      break;
    }

    if (isJpegSofMarker(marker) && segmentLength >= 8) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
};

/**
 * Read width/height from PNG or JPEG headers without a full image decoder.
 * WebP and other formats return null — use browser decoding for those.
 */
export const readImageDimensions = (bytes: ArrayBuffer): ImageSize | null => {
  const view = new DataView(bytes);

  if (view.byteLength < 10) {
    return null;
  }

  return readPngDimensions(view) ?? readJpegDimensions(view);
};
