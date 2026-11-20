const size = 64;
const paletteOffset = 54;
const pixelOffset = paletteOffset + 256 * 4;
const fileSize = pixelOffset + size * size;

export function grainTileBytes() {
    const bytes = new Uint8Array(fileSize);
    const view = new DataView(bytes.buffer);
    bytes.set([0x42, 0x4d]);
    view.setUint32(2, fileSize, true);
    view.setUint32(10, pixelOffset, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, size, true);
    view.setInt32(22, size, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 8, true);
    view.setUint32(34, size * size, true);
    view.setUint32(46, 256, true);
    for (let gray = 0; gray < 256; gray += 1) {
        bytes.set([gray, gray, gray, 0], paletteOffset + gray * 4);
    }
    const random = xorshift32(0x9e3779b9);
    for (let index = pixelOffset; index < fileSize; index += 1) {
        bytes[index] = Math.round(128 + (random() + random() - 1) * 72);
    }
    return bytes;
}

export const grainTile = `url("data:image/bmp;base64,${btoa(
    Array.from(grainTileBytes(), (byte) => String.fromCharCode(byte)).join('')
)}")`;

function xorshift32(seed: number) {
    let state = seed;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 4_294_967_296;
    };
}
