import { expect, test } from 'bun:test';
import {
    agentDreamDetailSchema,
    agentDreamRecordSchema,
    agentDreamsInputSchema,
    dreamPatchLimitBytes,
} from './agent-dreams.ts';

const record = {
    agentId: 'agt_1',
    files: [{ added: 1, change: 'modified', path: 'MEMORY.md', removed: 0 }],
    finishedAt: '2026-10-11T03:05:00.000Z',
    patch: 'diff --git a/MEMORY.md b/MEMORY.md\n',
    runId: 'run_1',
    startedAt: '2026-10-11T03:00:00.000Z',
    truncated: false,
    type: 'agent-dream-record',
} as const;

test('a truncated record compared nothing, so it carries no files or patch', () => {
    const truncated = { ...record, files: [], patch: '', truncated: true };
    expect(agentDreamRecordSchema.parse(truncated).truncated).toBe(true);
    expect(agentDreamRecordSchema.safeParse({ ...record, truncated: true }).success).toBe(false);
});

test('a dream record carries file stats and a capped patch', () => {
    expect(agentDreamRecordSchema.parse(record)).toEqual({ ...record, files: [...record.files] });
    expect(agentDreamRecordSchema.parse({ ...record, files: [], patch: '' }).files).toEqual([]);
    expect(
        agentDreamRecordSchema.parse({
            ...record,
            files: [
                { added: 0, change: 'added', omitted: 'binary', path: 'notes/a.png', removed: 0 },
            ],
        }).files[0]?.omitted
    ).toBe('binary');
    expect(() =>
        agentDreamRecordSchema.parse({ ...record, patch: 'x'.repeat(dreamPatchLimitBytes + 1) })
    ).toThrow();
    expect(() =>
        agentDreamRecordSchema.parse({
            ...record,
            files: [{ added: -1, change: 'modified', path: 'MEMORY.md', removed: 0 }],
        })
    ).toThrow();
    expect(() => agentDreamRecordSchema.parse({ ...record, extra: true })).toThrow();
});

test('dream reads page newest first and a missing detail is null', () => {
    expect(agentDreamsInputSchema.parse({ agentId: 'agt_1', serverId: 'srv_1' }).limit).toBe(20);
    expect(() =>
        agentDreamsInputSchema.parse({ agentId: 'agt_1', limit: 61, serverId: 'srv_1' })
    ).toThrow();
    expect(agentDreamDetailSchema.parse(null)).toBeNull();
});
