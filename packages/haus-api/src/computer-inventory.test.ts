import { expect, test } from 'bun:test';
import { computerInventorySchema } from './computer-inventory.ts';

const observedAt = '2026-10-20T12:00:00.000Z';

test('a not-yet-upgraded Computer reporting a Pi sign-in issue keeps its inventory', () => {
    const parsed = computerInventorySchema.safeParse({
        runtimeIssues: [
            { kind: 'authentication', observedAt, runtimeId: 'pi' },
            { kind: 'authentication', observedAt, runtimeId: 'codex' },
        ],
        runtimes: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.runtimeIssues).toEqual([
        { kind: 'authentication', observedAt, runtimeId: 'codex' },
    ]);
});

test('an unknown runtime issue is still rejected', () => {
    expect(
        computerInventorySchema.safeParse({
            runtimeIssues: [{ kind: 'authentication', observedAt, runtimeId: 'cursor' }],
            runtimes: [],
        }).success
    ).toBe(false);
});
