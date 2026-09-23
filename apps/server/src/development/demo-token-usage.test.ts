import { describe, expect, it } from 'bun:test';
import { demoTokenUsage } from './demo-token-usage.ts';

const serverId = 'srv_test';
const agents = [
    { id: 'agt_blippy', modelId: 'gpt-5.6-sol', weight: 1 },
    { id: 'agt_tiny', modelId: 'gpt-5.6-terra', weight: 0.55 },
];

describe('demoTokenUsage', () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const rows = demoTokenUsage(serverId, now, agents);

    it('covers the longest range the dashboard offers, for every Agent', () => {
        const dates = new Set(rows.map((row) => row.date));
        expect(dates.size).toBe(90);
        expect(rows).toHaveLength(180);
        expect(dates.has('2026-08-25')).toBe(true);
        expect(dates.has('2026-05-28')).toBe(true);
    });

    it('gives the breakdown more than one configuration to draw', () => {
        const configurations = new Set(rows.map((row) => `${row.runtimeId}/${row.modelId}`));
        expect([...configurations].sort()).toEqual([
            'claude-code/claude-sonnet-5',
            'codex/gpt-5.6-sol',
            'codex/gpt-5.6-terra',
        ]);
    });

    it('follows the usage contract: input includes cached input, total is input plus output', () => {
        for (const row of rows) {
            expect(row.cacheReadTokens + row.cacheWriteTokens).toBeLessThanOrEqual(row.inputTokens);
            expect(row.totalTokens).toBe(row.inputTokens + row.outputTokens);
            expect(row.turnCount).toBeGreaterThan(0);
        }
    });

    it('is derived, not random, so two developers see the same chart', () => {
        expect(demoTokenUsage(serverId, now, agents)).toEqual(rows);
    });
});
