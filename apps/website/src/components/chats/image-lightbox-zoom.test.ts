import { expect, test } from 'bun:test';
import { fitScale, zoomInFrom, zoomOutFrom } from './image-lightbox-zoom.ts';

test('fit is the true scale of a large print, and never enlarges a small image', () => {
    const stage = { height: 760, width: 1200 };
    expect(fitScale({ height: 5400, width: 4500 }, stage)).toBeCloseTo(760 / 5400);
    expect(Math.round(fitScale({ height: 5400, width: 4500 }, stage) * 100)).toBe(14);
    expect(fitScale({ height: 120, width: 160 }, stage)).toBe(1);
    expect(fitScale(null, stage)).toBe(1);
});

test('zoom steps through fixed stops from wherever fit left it', () => {
    expect(zoomInFrom(0.14)).toBe(0.25);
    expect(zoomInFrom(1)).toBe(1.5);
    expect(zoomInFrom(4)).toBeNull();
    expect(zoomOutFrom(0.5, 0.14)).toBe(0.25);
    // Stepping out to or below fit returns to fit.
    expect(zoomOutFrom(0.25, 0.14)).toBeNull();
    expect(zoomOutFrom(1.5, 1)).toBeNull();
});
