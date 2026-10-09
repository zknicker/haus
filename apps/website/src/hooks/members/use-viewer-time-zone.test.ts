import { expect, test } from 'bun:test';
import { resolveViewerTimeZone } from './use-viewer-time-zone.ts';

const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

test('the saved Profile zone wins over the device zone', () => {
    const saved = device === 'Asia/Kolkata' ? 'Pacific/Auckland' : 'Asia/Kolkata';
    expect(resolveViewerTimeZone(saved)).toBe(saved);
});

test('the device zone fills in only while the saved zone is blank or unrecognized', () => {
    expect(resolveViewerTimeZone(null)).toBe(device);
    expect(resolveViewerTimeZone(undefined)).toBe(device);
    expect(resolveViewerTimeZone('')).toBe(device);
    expect(resolveViewerTimeZone('Invalid/Zone')).toBe(device);
});
