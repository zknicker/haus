import { expect, test } from 'bun:test';
import { isPreviewImage } from './artifact-format.ts';

test('only passive raster formats render inline, never executable SVG or HTML', () => {
    expect(isPreviewImage('image/png')).toBe(true);
    expect(isPreviewImage('image/webp')).toBe(true);
    expect(isPreviewImage('image/svg+xml')).toBe(false);
    expect(isPreviewImage('text/html')).toBe(false);
    expect(isPreviewImage('application/pdf')).toBe(false);
});
