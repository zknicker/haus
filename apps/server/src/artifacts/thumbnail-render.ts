/** Longest edge of a thumbnail: sharp on 2x library grids, far smaller than print originals. */
export const artifactThumbnailEdge = 1024;
/** Originals above this are not read back for a thumbnail (production uploads stop at 100 MB). */
export const artifactThumbnailSourceMaxBytes = 100_000_000;
/** Decoded pixels a source may have: bounds the RGBA buffer at 256 MiB. */
const maxSourcePixels = 64_000_000;

/** The raster formats the App previews; SVG and HTML never render, so they never get one. */
const thumbnailContentTypes = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
]);

export function isThumbnailSource(contentType: string, byteSize: number) {
    return thumbnailContentTypes.has(contentType) && byteSize <= artifactThumbnailSourceMaxBytes;
}

/**
 * Renders a WebP thumbnail with Bun's built-in image codec, so the compiled Server binary needs no
 * native addon. Rejects when the bytes do not decode as a supported raster image.
 */
export async function renderArtifactThumbnail(source: Uint8Array): Promise<Uint8Array> {
    return await new bunImage.Image(source, { maxPixels: maxSourcePixels })
        .resize(artifactThumbnailEdge, artifactThumbnailEdge, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .bytes();
}

/**
 * The slice of `Bun.Image` (Bun 1.4) used here. The pinned `bun-types` predates it; drop this once
 * `bun-types` declares `Bun.Image`.
 */
interface BunImagePipeline {
    bytes(): Promise<Uint8Array>;
    resize(
        width: number,
        height: number,
        options: { fit: 'inside'; withoutEnlargement: boolean }
    ): BunImagePipeline;
    webp(options: { quality: number }): BunImagePipeline;
}
const bunImage = Bun as unknown as {
    Image: new (source: Uint8Array, options: { maxPixels: number }) => BunImagePipeline;
};
