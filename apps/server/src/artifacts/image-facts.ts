import type { ArtifactImageFacts } from '@haus/api';

/**
 * A raster original's pixel size from Bun's image codec (header only, no decode), and its print
 * density when the file records one: a PNG `pHYs` chunk in pixels per metre. Other formats report
 * no density. Rejects when the bytes are not a supported raster image.
 */
export async function measureArtifactImage(source: Uint8Array): Promise<ArtifactImageFacts> {
    const metadata = await new bunImage.Image(source).metadata();
    if (!(metadata.width > 0 && metadata.height > 0)) {
        throw new Error('Image has no pixel size.');
    }
    return { dpi: pngDpi(source), height: metadata.height, width: metadata.width };
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const metresPerInch = 0.0254;

/** Walks PNG chunks up to the first `IDAT`; `pHYs` with unit 1 is pixels per metre. */
export function pngDpi(bytes: Uint8Array): number | null {
    if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    while (offset + 8 <= bytes.byteLength) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (type === 'IDAT' || type === 'IEND') {
            return null;
        }
        if (type === 'pHYs' && length === 9 && offset + 17 <= bytes.byteLength) {
            const perMetreX = view.getUint32(offset + 8);
            const unit = bytes[offset + 16];
            return unit === 1 && perMetreX > 0 ? Math.round(perMetreX * metresPerInch) : null;
        }
        offset += 12 + length;
    }
    return null;
}

/** The slice of `Bun.Image` (Bun 1.4) read here; see `thumbnail-render.ts`. */
const bunImage = Bun as unknown as {
    Image: new (source: Uint8Array) => { metadata(): Promise<{ height: number; width: number }> };
};
