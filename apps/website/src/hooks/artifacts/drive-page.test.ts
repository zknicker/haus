import { expect, test } from 'bun:test';
import { drivePagePath } from './drive-page.ts';

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
