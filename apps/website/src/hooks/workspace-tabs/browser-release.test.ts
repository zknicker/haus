import { describe, expect, test } from 'bun:test';
import { createBrowserRelease } from './browser-release.ts';

describe('releasing Electron’s browser selection', () => {
    test('Electron’s picks during a release do not show; its empty report ends the release', () => {
        const release = createBrowserRelease();
        release.begin();
        release.settle(null);
        // Closing the selected page reports Electron's own successor first.
        expect(release.accept('b2')).toBe(false);
        expect(release.accept(null)).toBe(false);
        expect(release.accept('b3')).toBe(true);
    });

    test('a failed release ends it, so later selections are not ignored', () => {
        const release = createBrowserRelease();
        release.begin();
        release.settle(undefined);
        expect(release.accept('b2')).toBe(true);
    });

    test('a release Electron answered with a page still selected ends it', () => {
        const release = createBrowserRelease();
        release.begin();
        release.settle('b1');
        expect(release.accept('b1')).toBe(true);
    });

    test('asking for a browser page cancels a release in flight', () => {
        const release = createBrowserRelease();
        release.begin();
        release.cancel();
        expect(release.accept('b1')).toBe(true);
    });
});
