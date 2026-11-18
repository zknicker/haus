import { expect, test } from 'bun:test';
import type { BrowserBounds } from '../../lib/desktop-browser.ts';
import { type BrowserCoverIO, createBrowserCover } from './browser-cover.ts';

const bounds: BrowserBounds = { x: 0, y: 40, width: 800, height: 600 };
const image = 'data:image/jpeg;base64,/9j/4AAQ';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function fixture(capture: BrowserCoverIO['capture'] = async () => image) {
    const log: string[] = [];
    const cover = createBrowserCover({
        afterFrame: async () => {
            log.push('frame');
        },
        capture: () => {
            log.push('capture');
            return capture();
        },
        paint: async (value) => {
            log.push(value ? 'paint' : 'release');
        },
        place: async (value) => {
            log.push(value ? 'show' : 'hide');
        },
    });
    return { cover, log };
}

test('covering captures and paints the snapshot before hiding the native view', async () => {
    const { cover, log } = fixture();
    await cover.cover({ snapshot: true });
    expect(log).toEqual(['capture', 'paint', 'hide']);
});

test('revealing shows the native view before releasing the snapshot', async () => {
    const { cover, log } = fixture();
    await cover.reveal(bounds);
    expect(log).toEqual(['show', 'frame', 'release']);
});

test('failed, invalid, or skipped captures fall back to the page background', async () => {
    for (const capture of [
        async () => null,
        async () => 'https://example.com/shot.jpg',
        () => Promise.reject(new Error('capture failed')),
    ]) {
        const { cover, log } = fixture(capture);
        await cover.cover({ snapshot: true });
        expect(log).toEqual(['capture', 'release', 'hide']);
    }
    const { cover, log } = fixture();
    await cover.cover({ snapshot: false });
    expect(log).toEqual(['release', 'hide']);
});

test('a capture that finishes after a reveal, a newer cover, or unmount is discarded', async () => {
    for (const supersede of [
        (cover: ReturnType<typeof createBrowserCover>) => cover.reveal(bounds),
        (cover: ReturnType<typeof createBrowserCover>) => cover.cover({ snapshot: false }),
        (cover: ReturnType<typeof createBrowserCover>) => cover.dispose(),
    ]) {
        const pending = deferred<unknown>();
        const { cover, log } = fixture(() => pending.promise);
        const stale = cover.cover({ snapshot: true });
        await supersede(cover);
        const settled = log.length;
        pending.resolve(image);
        await stale;
        expect(log.slice(settled)).toEqual([]);
        expect(log).not.toContain('paint');
    }
});

test('a reveal overtaken by a new cover never releases the new snapshot', async () => {
    const shown = deferred<void>();
    const log: string[] = [];
    const cover = createBrowserCover({
        afterFrame: async () => {
            log.push('frame');
        },
        capture: async () => {
            log.push('capture');
            return image;
        },
        paint: async (value) => {
            log.push(value ? 'paint' : 'release');
        },
        place: (value) => {
            log.push(value ? 'show' : 'hide');
            return value ? shown.promise : Promise.resolve();
        },
    });
    const reveal = cover.reveal(bounds);
    await cover.cover({ snapshot: true });
    shown.resolve();
    await reveal;
    expect(log).toEqual(['show', 'capture', 'paint', 'hide']);
});

test('layout reports cover once while an overlay stays open and reveal once when it closes', async () => {
    const { cover, log } = fixture();
    const report = (overlay: boolean, height = 600) =>
        cover.update({ bounds: { ...bounds, height }, hidden: false, overlay });
    await report(false);
    expect(log).toEqual(['show', 'frame', 'release']);
    log.length = 0;
    // The list opens, then changes height with every keystroke; the page resizes underneath it.
    await report(true);
    for (const height of [600, 600, 580, 600]) {
        expect(report(true, height)).toBeNull();
    }
    expect(log).toEqual(['capture', 'paint', 'hide']);
    log.length = 0;
    await report(false);
    expect(report(false)).toBeNull();
    expect(log).toEqual(['show', 'frame', 'release']);
});

test('layout reports reveal again when the page moves, and hidden pages skip the snapshot', async () => {
    const { cover, log } = fixture();
    await cover.update({ bounds, hidden: false, overlay: false });
    await cover.update({ bounds: { ...bounds, width: 640 }, hidden: false, overlay: false });
    expect(log).toEqual(['show', 'frame', 'release', 'show', 'frame', 'release']);
    log.length = 0;
    await cover.update({ bounds, hidden: true, overlay: true });
    expect(cover.update({ bounds, hidden: true, overlay: false })).toBeNull();
    expect(log).toEqual(['release', 'hide']);
});
