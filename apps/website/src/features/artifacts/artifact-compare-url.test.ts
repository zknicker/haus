import { expect, test } from 'bun:test';
import { parseRevisionView, revisionViewHref } from './artifact-compare-url.ts';

test('a comparison against the current revision carries only compare', () => {
    const href = revisionViewHref('/s/haus/artifacts/art_1?in=designs', {
        compare: 'rev_2',
        revision: null,
    });
    expect(href).toBe('/s/haus/artifacts/art_1?in=designs&compare=rev_2');
    expect(parseRevisionView(new URLSearchParams('in=designs&compare=rev_2'))).toEqual({
        compare: 'rev_2',
        revision: null,
    });
});

test('a comparison between two older revisions round-trips', () => {
    const view = { compare: 'rev_1', revision: 'rev_3' };
    const href = revisionViewHref('/s/haus/artifacts/art_1', view);
    expect(href).toBe('/s/haus/artifacts/art_1?compare=rev_1&revision=rev_3');
    expect(parseRevisionView(new URLSearchParams(href.split('?')[1]))).toEqual(view);
});

test('leaving a comparison drops both revisions and keeps the library context', () => {
    const href = revisionViewHref('/s/haus/artifacts/art_1?compare=rev_1&in=&revision=rev_3', {
        compare: null,
        revision: null,
    });
    expect(href).toBe('/s/haus/artifacts/art_1?in=');
    expect(
        revisionViewHref('/s/haus/artifacts/art_1?revision=rev_3', {
            compare: null,
            revision: null,
        })
    ).toBe('/s/haus/artifacts/art_1');
});

test('empty values read as absent', () => {
    expect(parseRevisionView(new URLSearchParams('compare=&revision='))).toEqual({
        compare: null,
        revision: null,
    });
});
