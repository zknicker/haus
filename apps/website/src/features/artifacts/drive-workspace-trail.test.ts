import { expect, test } from 'bun:test';
import { collapseTrail } from '../shell/band-trail.ts';
import { droppableCrumbs, workspacePathCrumbs } from './drive-workspace-trail.ts';

const drag = { canMoveInto: () => true, moveInto: () => undefined };

test('a path row lists All files, then each folder below the area', () => {
    expect(workspacePathCrumbs('dev', 'haus', 'haus/specs').map((crumb) => crumb.label)).toEqual([
        'All files',
        'specs',
    ]);
});

test('a deep path folds its middle behind one menu, keeping the first crumb and the parent', () => {
    const crumbs = droppableCrumbs(workspacePathCrumbs('dev', 'haus', 'haus/a/b/c/d'), drag);
    const trail = collapseTrail(crumbs);
    expect(trail.leading.map((crumb) => crumb.label)).toEqual(['All files']);
    expect(trail.hidden.map((crumb) => crumb.label)).toEqual(['a', 'b', 'c']);
    expect(trail.trailing.map((crumb) => crumb.label)).toEqual(['d']);
    expect(trail.trailing[0]?.drop).toBeDefined();
});

test('a shallow path does not fold', () => {
    const trail = collapseTrail(workspacePathCrumbs('dev', 'haus', 'haus/a/b'));
    expect(trail.hidden).toEqual([]);
    expect(trail.leading).toHaveLength(3);
});
