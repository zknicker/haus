import { expect, test } from 'bun:test';
import {
    artifactViewerHref,
    libraryHref,
    librarySearch,
    parseLibrarySearch,
    parseViewerContext,
} from './library-params.ts';

test('the open folder and filters round-trip through the URL', () => {
    const view = {
        creator: { agent_id: 'ag_1', type: 'agent' as const },
        folder: 'starter-kit/scripts',
        kind: 'images' as const,
    };
    const search = librarySearch(view);
    expect(search).toBe('?folder=starter-kit%2Fscripts&kind=images&creator=agent%3Aag_1');
    expect(parseLibrarySearch(new URLSearchParams(search))).toEqual(view);
});

test('defaults stay out of the URL', () => {
    expect(librarySearch({ creator: null, folder: '', kind: 'all' })).toBe('');
    expect(libraryHref('acme', { creator: null, folder: 'docs', kind: 'all' })).toBe(
        '/s/acme/artifacts?folder=docs'
    );
});

test('a malformed folder or filter reads as its default', () => {
    for (const folder of ['/abs', 'a//b', 'a/../b', 'trailing/']) {
        expect(parseLibrarySearch(new URLSearchParams({ folder })).folder).toBe('');
    }
    expect(parseLibrarySearch(new URLSearchParams({ creator: 'team:x', kind: 'zip' }))).toEqual({
        creator: null,
        folder: '',
        kind: 'all',
    });
});

test('a folder is NFC-normalized like every drive path', () => {
    const decomposed = 'cafe'.concat(String.fromCharCode(769));
    const composed = 'caf'.concat(String.fromCharCode(233));
    expect(parseLibrarySearch(new URLSearchParams({ folder: decomposed })).folder).toBe(composed);
});

test('a viewer carries the library context it was opened from, even at the root', () => {
    const context = { creator: null, folder: '', kind: 'images' as const, query: 'cat' };
    const href = artifactViewerHref('acme', 'art_1', context);
    expect(href).toBe('/s/acme/artifacts/art_1?kind=images&in=&q=cat');
    expect(parseViewerContext(new URL(href, 'https://x.test').searchParams)).toEqual(context);
    expect(artifactViewerHref('acme', 'art_1', null)).toBe('/s/acme/artifacts/art_1');
    expect(parseViewerContext(new URLSearchParams('revision=rev_1'))).toBeNull();
});
