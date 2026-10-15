import { describe, expect, test } from 'bun:test';
import { isLibraryPath, libraryHistorySteps, routerPathFromUrl } from './library-history.ts';

const library = '/s/haus/artifacts';

describe('libraryHistorySteps', () => {
    test('steps between library entries in both directions', () => {
        const paths = [`${library}`, `${library}?folder=a`, `${library}?folder=a%2Fb&kind=images`];
        expect(libraryHistorySteps(paths, 0, library)).toEqual({ back: false, forward: true });
        expect(libraryHistorySteps(paths, 1, library)).toEqual({ back: true, forward: true });
        expect(libraryHistorySteps(paths, 2, library)).toEqual({ back: true, forward: false });
    });

    test('stops at entries outside the library view', () => {
        const paths = ['/s/haus/chats/c1', `${library}?folder=a`, `${library}/artifact-1`, null];
        expect(libraryHistorySteps(paths, 1, library)).toEqual({ back: false, forward: false });
        expect(libraryHistorySteps([null, library, null], 1, library)).toEqual({
            back: false,
            forward: false,
        });
    });

    test('another Server’s library is not this one', () => {
        expect(libraryHistorySteps(['/s/other/artifacts', library], 1, library).back).toBeFalse();
    });
});

describe('isLibraryPath', () => {
    test('matches the library at any search, not a file under it', () => {
        expect(isLibraryPath(`${library}?folder=a`, library)).toBeTrue();
        expect(isLibraryPath(`${library}/`, library)).toBeTrue();
        expect(isLibraryPath(`${library}/abc`, library)).toBeFalse();
        expect(isLibraryPath('/s/haus/artifactsx', library)).toBeFalse();
    });
});

describe('routerPathFromUrl', () => {
    test('reads the browser path on the web and the hash route on desktop', () => {
        expect(routerPathFromUrl('https://haus.chat/s/haus/artifacts?folder=a')).toBe(
            '/s/haus/artifacts?folder=a'
        );
        expect(routerPathFromUrl('file:///app/index.html#/s/haus/artifacts?folder=a')).toBe(
            '/s/haus/artifacts?folder=a'
        );
        expect(routerPathFromUrl(null)).toBeNull();
        expect(routerPathFromUrl('not a url')).toBeNull();
    });
});
