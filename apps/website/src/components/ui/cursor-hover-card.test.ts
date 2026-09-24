import { expect, test } from 'bun:test';
import { getCursorHoverOffset } from './cursor-hover-card.tsx';

const bounds = { height: 20, left: 100, top: 40, width: 100 };

test('centers the cursor-following surface when the pointer is centered', () => {
    expect(getCursorHoverOffset({ bounds, clientX: 150, clientY: 50 })).toEqual({ x: 0, y: 0 });
});

test('tracks the pointer through the trigger edge without slowing or stopping', () => {
    expect(getCursorHoverOffset({ bounds, clientX: 199, clientY: 59 })).toEqual({
        x: 49,
        y: 9,
    });
    expect(getCursorHoverOffset({ bounds, clientX: 200, clientY: 60 })).toEqual({
        x: 50,
        y: 10,
    });
    expect(getCursorHoverOffset({ bounds, clientX: 250, clientY: 90 })).toEqual({
        x: 100,
        y: 40,
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
    ).toEqual({ x: 0, y: 0 });
});
