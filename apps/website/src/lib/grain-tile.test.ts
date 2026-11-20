import { expect, test } from 'bun:test';
import { grainTile, grainTileBytes } from './grain-tile.ts';

test('the grain tile is a small static grayscale bitmap, the same on every load', () => {
    const bytes = grainTileBytes();
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe('BM');
    expect(view.getUint32(2, true)).toBe(bytes.length);
    expect(view.getInt32(18, true)).toBe(64);
    expect(view.getInt32(22, true)).toBe(64);
    expect(view.getUint16(28, true)).toBe(8);
    expect(bytes.length).toBe(5174);
    expect(grainTileBytes()).toEqual(bytes);
    expect(grainTile.startsWith('url("data:image/bmp;base64,Qk')).toBe(true);
    expect(grainTile.length).toBeLessThan(8000);
    expect(grainTile).not.toContain('feTurbulence');
});

test('the grain varies around mid-gray', () => {
    const pixels = [...grainTileBytes().subarray(1078)];
    const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
    expect(Math.abs(mean - 128)).toBeLessThan(4);
    expect(new Set(pixels).size).toBeGreaterThan(100);
});
