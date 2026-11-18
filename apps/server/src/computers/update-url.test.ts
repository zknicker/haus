import { describe, expect, test } from 'bun:test';
import { releaseManifestUrl } from './update.ts';

describe('Computer release selection', () => {
    test('keeps the production pointer when no Haus release is selected', () => {
        expect(releaseManifestUrl('https://releases.haus.chat/computer/latest.json')).toBe(
            'https://releases.haus.chat/computer/latest.json'
        );
    });

    test('binds an update to the immutable Computer release selected by Haus', () => {
        expect(releaseManifestUrl('https://releases.haus.chat/computer/latest.json', '1.4.9')).toBe(
            'https://releases.haus.chat/computer/1.4.9/release.json'
        );
    });
});
