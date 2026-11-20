import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type AgentTurnSummary, agentTurnSummarySchema } from '@haus/api';
import * as z from 'zod';
import { readJson, writeJsonAtomic } from './inbox-store.ts';

const markerSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('accepted') }),
    z.object({ status: z.literal('settled'), summary: agentTurnSummarySchema }),
]);

const visibleSchema = z.array(
    z.object({ chatId: z.string(), id: z.string(), sequence: z.number().int().positive() })
);

export type VisibleMessage = z.infer<typeof visibleSchema>[number];

export function runRecords(runtimeDir: string, runId: string) {
    const markerPath = join(runtimeDir, 'runs', `${runId}.json`);
    const visiblePath = join(runtimeDir, 'runs', `${runId}-visible.json`);
    const readVisible = async () => {
        const raw = await readJson(visiblePath);
        return raw === null ? [] : visibleSchema.parse(raw);
    };
    return {
        async accepted() {
            await writeJsonAtomic(markerPath, { status: 'accepted' });
        },
        async marker() {
            const raw = await readJson(markerPath);
            return raw === null ? null : (markerSchema.safeParse(raw).data ?? null);
        },
        async recordVisible(messages: readonly VisibleMessage[]) {
            if (messages.length === 0) {
                return;
            }
            const byId = new Map((await readVisible()).map((message) => [message.id, message]));
            for (const message of messages) {
                byId.set(message.id, message);
            }
            await writeJsonAtomic(visiblePath, [...byId.values()]);
        },
        async settled(summary: AgentTurnSummary) {
            await writeJsonAtomic(markerPath, { status: 'settled', summary });
            await rm(visiblePath, { force: true });
        },
        visible: readVisible,
    };
}
