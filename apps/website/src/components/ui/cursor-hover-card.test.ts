import { expect, test } from 'bun:test';
import { getCursorHoverOffset } from './cursor-hover-card.tsx';

const bounds = { height: 20, left: 100, top: 40, width: 100 };

test('anchors the preview beside the pointer, not the trigger center', () => {
    expect(getCursorHoverOffset({ bounds, clientX: 150, clientY: 50 })).toEqual({ x: 65, y: -35 });
});

test('follows the pointer one-to-one without a travel cap', () => {
    expect(getCursorHoverOffset({ bounds, clientX: 200, clientY: 60 })).toEqual({ x: 115, y: -25 });
    expect(getCursorHoverOffset({ bounds, clientX: 1000, clientY: 1000 })).toEqual({
        x: 915,
        y: 915,
    });
});

test("keeps cursor-following motion inside HeroUI's viewport boundary", () => {
    expect(
        getCursorHoverOffset({
            bounds: { height: 18, left: 677, top: 841, width: 80 },
            clientX: 756,
            clientY: 850,
            surfaceBounds: { bottom: 943, left: 601, right: 931, top: 867 },
            viewport: { height: 1045, width: 943 },
        })
    ).toEqual({ x: 0, y: -108 });
});

test('anchors the bottom-left corner against the actual positioned surface', () => {
    expect(
        getCursorHoverOffset({
            bounds,
            clientX: 180,
            clientY: 252,
            surfaceBounds: { left: 90, top: 80, right: 390, bottom: 180 },
            viewport: { width: 1000, height: 800 },
        })
    ).toEqual({ x: 105, y: 57 });
});
