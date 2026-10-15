import { describe, expect, test } from 'bun:test';
import { collapseTrail } from './library-trail.ts';

const crumb = (label: string) => ({ href: `/s/haus/artifacts?folder=${label}`, label });

describe('collapseTrail', () => {
    test('keeps every ancestor a link while the trail is short', () => {
        const crumbs = ['Files', 'a', 'b'].map(crumb);
        expect(collapseTrail(crumbs)).toEqual({ hidden: [], leading: crumbs, trailing: [] });
        expect(collapseTrail([])).toEqual({ hidden: [], leading: [], trailing: [] });
    });

    test('folds the middle of a deep trail, keeping Files and the parent', () => {
        const crumbs = ['Files', 'a', 'b', 'c', 'd'].map(crumb);
        expect(collapseTrail(crumbs)).toEqual({
            hidden: ['a', 'b', 'c'].map(crumb),
            leading: [crumb('Files')],
            trailing: [crumb('d')],
        });
    });

    test('never folds a single folder', () => {
        const crumbs = ['Files', 'a', 'b', 'c'].map(crumb);
        expect(collapseTrail(crumbs).hidden).toEqual(['a', 'b'].map(crumb));
        expect(collapseTrail(crumbs.slice(0, 3)).hidden).toEqual([]);
    });
});
