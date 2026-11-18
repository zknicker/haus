import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeTokenUsageSnapshot } from '@haus/api';
import {
    buildRuntimeTokenSnapshot,
    collectRecentJsonlFiles,
    objectValue,
    type RuntimeTokenEntry,
    readJsonLines,
    tokenCount,
    usageCutoffMs,
    usageFilesFingerprint,
} from './local-runtime-usage.ts';

let snapshotCache: { fingerprint: string; snapshot: RuntimeTokenUsageSnapshot } | null = null;

export async function readGrokLocalUsage(
    options: { grokHome?: string; now?: Date } = {}
): Promise<RuntimeTokenUsageSnapshot | null> {
    const now = options.now ?? new Date();
    const grokHome =
        options.grokHome ?? (process.env.GROK_HOME?.trim() || join(homedir(), '.grok'));
    const files = await collectRecentJsonlFiles(
        join(grokHome, 'sessions'),
        'updates.jsonl',
        usageCutoffMs(now)
    );
    if (files.length === 0) {
        return null;
    }
    const fingerprint = usageFilesFingerprint(files, now);
    if (snapshotCache?.fingerprint === fingerprint) {
        return { ...snapshotCache.snapshot, capturedAt: now.toISOString() };
    }
    const entries = (
        await Promise.all(files.map(async (file) => parseGrokRows(await readJsonLines(file))))
    ).flat();
    const deduped = new Map<string, RuntimeTokenEntry>();
    for (const entry of entries) {
        if (!deduped.has(entry.id)) {
            deduped.set(entry.id, entry);
        }
    }
    const snapshot = buildRuntimeTokenSnapshot(
        [...deduped.values()],
        'grok-build',
        'grok-build-jsonl',
        now
    );
    snapshotCache = { fingerprint, snapshot };
    return snapshot;
}

export function parseGrokRows(rows: unknown[]): RuntimeTokenEntry[] {
    const entries: RuntimeTokenEntry[] = [];
    for (const row of rows) {
        const root = objectValue(row);
        const params = objectValue(root?.params);
        const update = objectValue(params?.update);
        if (update?.sessionUpdate !== 'turn_completed') {
            continue;
        }
        const usage = objectValue(update.usage);
        if (!usage) {
            continue;
        }
        const meta = objectValue(params?._meta);
        const timestampMs = resolveTimestampMs(root?.timestamp, meta?.agentTimestampMs);
        const eventId = typeof meta?.eventId === 'string' ? meta.eventId : null;
        const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : 'unknown';
        const modelUsage = objectValue(usage.modelUsage);
        const models =
            modelUsage && Object.keys(modelUsage).length > 0
                ? Object.entries(modelUsage)
                : [['unknown', usage] as const];
        for (const [modelId, rawModelUsage] of models) {
            const model = objectValue(rawModelUsage);
            if (!model) {
                continue;
            }
            const inputTokens = tokenCount(model.inputTokens);
            const cacheReadTokens = Math.min(tokenCount(model.cachedReadTokens), inputTokens);
            const cacheWriteTokens = Math.min(
                tokenCount(model.cacheCreationTokens),
                inputTokens - cacheReadTokens
            );
            const outputTokens = tokenCount(model.outputTokens);
            if (inputTokens + outputTokens === 0) {
                continue;
            }
            const fallbackId = [
                sessionId,
                timestampMs,
                modelId,
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                tokenCount(model.reasoningTokens),
            ].join('|');
            entries.push({
                cacheReadTokens,
                cacheWriteTokens,
                id: eventId ? `${eventId}|${modelId}` : fallbackId,
                inputTokens,
                modelId,
                outputTokens,
                timestampMs,
                totalTokens: inputTokens + outputTokens,
            });
        }
    }
    return entries;
}

function resolveTimestampMs(timestamp: unknown, agentTimestampMs: unknown): number {
    const agentMs = tokenCount(agentTimestampMs);
    if (agentMs > 0) {
        return agentMs;
    }
    return tokenCount(timestamp) * 1000;
}
