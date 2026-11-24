import { expect, test } from 'bun:test';
import { deltaBeforeRun } from './desktop-tabs-history.ts';
import type { TabHistory, TabLocation } from './desktop-tabs-model.ts';

const history = (paths: string[], index = paths.length - 1) =>
    ({
        entries: paths.map((path, at) => ({
            key: String(at),
            location: { kind: 'app', path },
            pageState: {},
        })),
        index,
    }) satisfies TabHistory;
const inSettings = (location: TabLocation) =>
    location.kind === 'app' && location.path.startsWith('settings');

test('steps back past every entry in the run to the one before it', () => {
    expect(deltaBeforeRun(history(['chat', 'settings', 'settings/members']), inSettings)).toBe(-2);
    expect(deltaBeforeRun(history(['chat', 'tasks', 'settings']), inSettings)).toBe(-1);
});

test('is null when the run starts the history or the current entry is outside it', () => {
    expect(deltaBeforeRun(history(['settings', 'settings/members']), inSettings)).toBeNull();
    expect(deltaBeforeRun(history(['settings', 'chat']), inSettings)).toBeNull();
});

test('reads from the current entry, ignoring forward entries', () => {
    expect(deltaBeforeRun(history(['chat', 'settings', 'tasks'], 1), inSettings)).toBe(-1);
});
