import { expect, test } from 'bun:test';
import { performHausUpdateAction } from './haus-update-action.ts';

test('a ready App restarts at once from the footer and never starts a run', () => {
    const calls: string[] = [];
    const handlers = {
        reload: () => calls.push('reload'),
        restartApp: () => calls.push('restart'),
        run: () => calls.push('run'),
    };

    performHausUpdateAction({ kind: 'restart', label: 'Restart' }, handlers);
    performHausUpdateAction({ kind: 'start', label: 'Update' }, handlers);
    performHausUpdateAction({ kind: 'retry', label: 'Try again' }, handlers);
    performHausUpdateAction({ kind: 'reload', label: 'Reload' }, handlers);

    expect(calls).toEqual(['restart', 'run', 'run', 'reload']);
});
