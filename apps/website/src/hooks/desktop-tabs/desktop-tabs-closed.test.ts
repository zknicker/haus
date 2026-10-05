import { describe, expect, test } from 'bun:test';
import { app, describeTabs, run, split } from './desktop-tabs-test-fixtures.ts';

/** `[inbox a] | [tasks b]`, primary focused. */
function twoByTwo() {
    return run(
        split(),
        { intent: 'newTabAtEnd', kind: 'openInFocusedPane', location: app('a'), newId: 'ta' },
        { kind: 'focusPane', pane: 'secondary' },
        { intent: 'newTabAtEnd', kind: 'openInFocusedPane', location: app('b'), newId: 'tb' },
        { kind: 'focusPane', pane: 'primary' }
    );
}

describe('reopening into a closed left pane', () => {
    test('the left pane’s last tab reopens as the left pane, not into the promoted row', () => {
        const closed = run(split(), { kind: 'close', tabIds: ['t0'] });
        expect(describeTabs(closed)).toEqual({
            focused: 'primary',
            primary: 'tasks*',
            secondary: '-',
        });
        expect(describeTabs(run(closed, { kind: 'reopenClosed' }))).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: 'tasks*',
        });
    });

    test('tabs closed one by one from both panes each return to their pane and index', () => {
        const all = twoByTwo();
        // ⌘W in the right pane, then the whole left pane, one tab at a time.
        const closed = run(
            all,
            { kind: 'close', tabIds: ['tb'] },
            { kind: 'close', tabIds: ['t0'] },
            { kind: 'close', tabIds: ['ta'] }
        );
        expect(describeTabs(closed).primary).toBe('tasks*');
        const once = run(closed, { kind: 'reopenClosed' });
        expect(describeTabs(once)).toEqual({
            focused: 'primary',
            primary: 'a*',
            secondary: 'tasks*',
        });
        const restored = run(once, { kind: 'reopenClosed' }, { kind: 'reopenClosed' });
        expect(describeTabs(restored)).toEqual({
            focused: 'secondary',
            primary: 'inbox* a',
            secondary: 'tasks b*',
        });
        expect(restored.primary?.tabIds).toEqual(all.primary?.tabIds ?? []);
        expect(restored.secondary?.tabIds).toEqual(all.secondary?.tabIds ?? []);
    });

    test('a left pane emptied by a drag still brings its closed tabs back on the left', () => {
        const state = run(
            twoByTwo(),
            { kind: 'close', tabIds: ['t0'] },
            { kind: 'move', tabIds: ['ta'], to: { index: 0, pane: 'secondary' } }
        );
        expect(describeTabs(state).primary).toBe('a* tasks b');
        expect(describeTabs(run(state, { kind: 'reopenClosed' }))).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: 'a* tasks b',
        });
    });

    test('with two panes open again, a closed left pane’s tab joins the left row at its index', () => {
        const state = run(
            twoByTwo(),
            { kind: 'close', tabIds: ['ta'] },
            { kind: 'close', tabIds: ['t0'] },
            // Split again before reopening.
            { kind: 'move', tabIds: ['tb'], to: { index: 0, pane: 'secondary' } }
        );
        expect(describeTabs(state).primary).toBe('tasks*');
        const reopened = run(state, { kind: 'reopenClosed' });
        expect(describeTabs(reopened).primary).toBe('inbox* tasks');
        expect(describeTabs(reopened).secondary).toBe('b*');
    });
});
