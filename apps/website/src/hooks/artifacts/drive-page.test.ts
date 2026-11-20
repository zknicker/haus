import { expect, test } from 'bun:test';
import { drivePageListInput, drivePagePath, resolveDrivePage } from './drive-page.ts';

test('a page under drive/ is that Drive path', () => {
    expect(drivePagePath('drive/agents/scout/workbench/plan.html', 'scout')).toBe(
        'agents/scout/workbench/plan.html'
    );
    expect(drivePagePath('drive/agents/scout/workbench/plan.html', null)).toBe(
        'agents/scout/workbench/plan.html'
    );
});

test('a pre-Drive workbench card lives in its Agent area once the handle is known', () => {
    expect(drivePagePath('workbench/pages/fleet.html', undefined)).toBeUndefined();
    expect(drivePagePath('workbench/pages/fleet.html', 'scout')).toBe(
        'agents/scout/workbench/pages/fleet.html'
    );
    expect(drivePagePath('workbench/pages/fleet.html', null)).toBeNull();
});

test('local scratch and a bare drive folder name no Drive file', () => {
    expect(drivePagePath('audits/deterministic.html', 'scout')).toBeNull();
    expect(drivePagePath('report.html', 'scout')).toBeNull();
});

test('the lookup lists the page folder narrowed to its file name', () => {
    expect(drivePageListInput('srv_1', 'agents/scout/workbench/plan.html')).toEqual({
        limit: 50,
        prefix: 'agents/scout/workbench',
        query: 'plan.html',
        serverId: 'srv_1',
    });
    expect(drivePageListInput('srv_1', 'plan.html').prefix).toBe('');
});

test('the listed file at the path resolves, at the pinned revision when there is one', () => {
    const listed = [
        { artifact_id: 'art_other', path: 'agents/scout/workbench/plan-old.html' },
        { artifact_id: 'art_plan', path: 'agents/scout/workbench/Plan.html' },
    ];
    expect(resolveDrivePage({ drivePath: 'agents/scout/workbench/plan.html', listed })).toEqual({
        artifactId: 'art_plan',
        status: 'ready',
    });
    expect(
        resolveDrivePage({
            drivePath: 'agents/scout/workbench/plan.html',
            listed,
            revisionId: 'rev_2',
        })
    ).toEqual({ artifactId: 'art_plan', revisionId: 'rev_2', status: 'ready' });
});

test('a path Drive does not hold is missing; an unfinished read is loading', () => {
    const listed = [{ artifact_id: 'art_other', path: 'agents/scout/workbench/plan-old.html' }];
    const path = 'agents/scout/workbench/plan.html';
    expect(resolveDrivePage({ drivePath: path, listed })).toEqual({ status: 'missing' });
    expect(resolveDrivePage({ drivePath: path, listed: null })).toEqual({ status: 'missing' });
    expect(resolveDrivePage({ drivePath: null, listed: undefined })).toEqual({
        status: 'missing',
    });
    expect(resolveDrivePage({ drivePath: path, listed: undefined })).toEqual({
        status: 'loading',
    });
    expect(resolveDrivePage({ drivePath: undefined, listed: undefined })).toEqual({
        status: 'loading',
    });
});
