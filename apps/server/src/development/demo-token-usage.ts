import type { agentTokenUsageDailyTable } from '../postgres/schema.ts';

/** A fully populated cube row: every column is `notNull`, only defaults are optional. */
export type DemoTokenUsageRow = Required<typeof agentTokenUsageDailyTable.$inferInsert>;

export interface DemoUsageAgent {
    id: string;
    modelId: string;
    weight: number;
}

/** The dashboard's longest range, so every range it offers has data behind it. */
const USAGE_DAYS = 90;

/**
 * A Server's worth of token usage.
 *
 * Written straight into the daily cube rather than synthesised from turns: the
 * dashboard reads the cube, and a seed that fabricated turns would also have to
 * fabricate their transcripts, deliveries, and timings to stay coherent.
 *
 * Values are derived from the day and the Agent rather than drawn at random, so
 * every developer sees the same chart and a screenshot means the same thing
 * twice. One Agent spends a stretch on a second runtime and model, because a
 * breakdown with a single row does not exercise the table it feeds.
 */
export function demoTokenUsage(
    serverId: string,
    now: Date,
    agents: DemoUsageAgent[]
): DemoTokenUsageRow[] {
    const rows: DemoTokenUsageRow[] = [];

    for (const [agentIndex, agent] of agents.entries()) {
        for (let dayOffset = 0; dayOffset < USAGE_DAYS; dayOffset += 1) {
            const day = new Date(now);
            day.setUTCDate(day.getUTCDate() - dayOffset);
            const date = day.toISOString().slice(0, 10);

            // Quiet weekends, a slow climb toward today, and a per-Agent phase
            // so the two lines do not move as one.
            const weekday = day.getUTCDay();
            const weekendFactor = weekday === 0 || weekday === 6 ? 0.35 : 1;
            const recencyFactor = 1 + (USAGE_DAYS - dayOffset) / USAGE_DAYS;
            const wobble = 0.75 + 0.5 * Math.abs(Math.sin(dayOffset + agentIndex * 2));
            const turnCount = Math.max(
                1,
                Math.round(9 * agent.weight * weekendFactor * recencyFactor * wobble)
            );

            // One Agent opened the window on a different runtime and model
            // before switching, which is what gives the breakdown a third row
            // and the chart a second runtime color family.
            const onLegacyStack = agentIndex === 1 && dayOffset >= USAGE_DAYS - 14;
            // Input includes cached input: cache read and write break it down,
            // and a turn's total is input plus output (docs/features/usage.md).
            const cacheReadTokens = turnCount * 2100;
            const cacheWriteTokens = turnCount * 260;
            const inputTokens = turnCount * 1450 + cacheReadTokens + cacheWriteTokens;
            const outputTokens = turnCount * 430;

            rows.push({
                agentId: agent.id,
                cacheReadTokens,
                cacheWriteTokens,
                date,
                inputTokens,
                modelId: onLegacyStack ? 'claude-sonnet-5' : agent.modelId,
                outputTokens,
                runtimeId: onLegacyStack ? 'claude-code' : 'codex',
                serverId,
                totalTokens: inputTokens + outputTokens,
                turnCount,
            });
        }
    }

    return rows;
}
