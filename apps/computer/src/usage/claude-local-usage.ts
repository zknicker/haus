import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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

interface ClaudeTokenEntry extends RuntimeTokenEntry {
    isSidechain: boolean;
    messageId: string | null;
    requestId: string | null;
}

let snapshotCache: { fingerprint: string; snapshot: RuntimeTokenUsageSnapshot } | null = null;

export async function readClaudeLocalUsage(
    options: { configDirs?: string[]; now?: Date } = {}
): Promise<RuntimeTokenUsageSnapshot | null> {
    const now = options.now ?? new Date();
    const roots = options.configDirs ?? resolveClaudeConfigDirs();
    const files = (
        await Promise.all(
            roots.map((root) =>
                collectRecentJsonlFiles(
                    join(root, 'projects'),
                    (name) => name.endsWith('.jsonl'),
                    usageCutoffMs(now)
                )
            )
        )
    ).flat();
    if (files.length === 0) {
        return null;
    }
    const fingerprint = usageFilesFingerprint(files, now);
    if (snapshotCache?.fingerprint === fingerprint) {
        return { ...snapshotCache.snapshot, capturedAt: now.toISOString() };
    }
    const entries = (
        await Promise.all(files.map(async (file) => parseClaudeRows(await readJsonLines(file))))
    ).flat();
    const snapshot = buildRuntimeTokenSnapshot(
        dedupeClaudeEntries(entries),
        'claude-code',
        'claude-code-jsonl',
        now
    );
    snapshotCache = { fingerprint, snapshot };
    return snapshot;
}

export function parseClaudeRows(rows: unknown[]): ClaudeTokenEntry[] {
    const entries: ClaudeTokenEntry[] = [];
    for (const row of rows) {
        const root = objectValue(row);
        const progress = objectValue(objectValue(root?.data)?.message);
        const envelope = progress ?? root;
        const message = objectValue(envelope?.message);
        const usage = objectValue(message?.usage);
        const timestamp =
            typeof envelope?.timestamp === 'string' ? Date.parse(envelope.timestamp) : Number.NaN;
        if (!(message && usage && Number.isFinite(timestamp))) {
            continue;
        }
        const uncachedInput = tokenCount(usage.input_tokens);
        const cacheReadTokens = tokenCount(usage.cache_read_input_tokens);
        const cacheWriteTokens = tokenCount(usage.cache_creation_input_tokens);
        const inputTokens = uncachedInput + cacheReadTokens + cacheWriteTokens;
        const outputTokens = tokenCount(usage.output_tokens);
        if (inputTokens + outputTokens === 0) {
            continue;
        }
        const messageId = typeof message.id === 'string' && message.id ? message.id : null;
        const requestId =
            typeof envelope?.requestId === 'string' && envelope.requestId
                ? envelope.requestId
                : null;
        entries.push({
            cacheReadTokens,
            cacheWriteTokens,
            id: messageId
                ? `${messageId}\u0000${requestId ?? ''}`
                : [
                      'anonymous',
                      timestamp,
                      message.model,
                      inputTokens,
                      outputTokens,
                      entries.length,
                  ].join(':'),
            inputTokens,
            isSidechain: envelope?.isSidechain === true,
            messageId,
            modelId:
                typeof message.model === 'string' && message.model !== '<synthetic>'
                    ? message.model
                    : 'unknown',
            outputTokens,
            requestId,
            timestampMs: timestamp,
            totalTokens: inputTokens + outputTokens,
        });
    }
    return entries;
}

export function dedupeClaudeEntries(entries: ClaudeTokenEntry[]): ClaudeTokenEntry[] {
    const deduped: ClaudeTokenEntry[] = [];
    const exactIndexes = new Map<string, number>();
    const messageIndexes = new Map<string, number[]>();
    for (const candidate of entries) {
        if (!candidate.messageId) {
            deduped.push(candidate);
            continue;
        }
        const exactKey = `${candidate.messageId}\u0000${candidate.requestId ?? ''}`;
        let index = exactIndexes.get(exactKey);
        if (index === undefined) {
            index = messageIndexes.get(candidate.messageId)?.find((existingIndex) => {
                const existing = deduped[existingIndex];
                return Boolean(existing && (candidate.isSidechain || existing.isSidechain));
            });
        }
        if (index !== undefined) {
            const existing = deduped[index];
            if (existing && shouldReplace(candidate, existing)) {
                deduped[index] = candidate;
                exactIndexes.set(exactKey, index);
            }
            continue;
        }
        const nextIndex = deduped.length;
        deduped.push(candidate);
        exactIndexes.set(exactKey, nextIndex);
        const indexes = messageIndexes.get(candidate.messageId) ?? [];
        indexes.push(nextIndex);
        messageIndexes.set(candidate.messageId, indexes);
    }
    return deduped;
}

function resolveClaudeConfigDirs(): string[] {
    const configured = process.env.CLAUDE_CONFIG_DIR?.split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (configured?.length) {
        return configured.map((value) => (basename(value) === 'projects' ? dirname(value) : value));
    }
    return [
        join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'claude'),
        join(homedir(), '.claude'),
    ];
}

function shouldReplace(candidate: ClaudeTokenEntry, existing: ClaudeTokenEntry): boolean {
    if (candidate.isSidechain !== existing.isSidechain) {
        return existing.isSidechain;
    }
    return candidate.totalTokens > existing.totalTokens;
}
