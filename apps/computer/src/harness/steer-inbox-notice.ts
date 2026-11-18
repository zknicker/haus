import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import type { HarnessTurnInput } from './executor.ts';

export function createNoticeDelivery(
    session: Pick<RuntimeSession, 'steer'>,
    turn: Pick<HarnessTurnInput, 'agentId' | 'agentRoot' | 'runId' | 'runtime' | 'runtimeId'>,
    alreadyVisible: string | null = null
) {
    let lastDelivered: string | null = alreadyVisible;
    return async (notice: string) => {
        if (!notice.trim()) {
            return false;
        }
        if (notice === lastDelivered) {
            await clearStoredNoticeIfMatching(turn.agentRoot, notice);
            return true;
        }
        const storedAt = await storedNoticeTime(turn.agentRoot, notice);
        if (storedAt === null || !(await steerInboxNotice(session, notice, turn.runtime))) {
            return false;
        }
        lastDelivered = notice;
        await clearStoredNoticeIfMatching(turn.agentRoot, notice);
        await turn.runtime.runPromise(
            Effect.logInfo('Inbox notice injected into the running turn.').pipe(
                Effect.annotateLogs({
                    agentId: turn.agentId,
                    elapsedMs: Math.max(0, Math.round(Date.now() - storedAt)),
                    event: 'inbox-notice-injected',
                    runId: turn.runId,
                    runtimeId: turn.runtimeId,
                })
            )
        );
        return true;
    };
}

/** When the stored notice still matches, the time it was written (its file's mtime). */
async function storedNoticeTime(agentRoot: string, notice: string): Promise<number | null> {
    try {
        const path = pendingNoticePath(agentRoot);
        const value = JSON.parse(await readFile(path, 'utf8')) as { notice?: unknown };
        if (value.notice !== notice) {
            return null;
        }
        // Timing only: a notice replaced since the read still delivers.
        return await stat(path).then(
            (file) => file.mtimeMs,
            () => Date.now()
        );
    } catch (cause) {
        if (isRecord(cause) && cause.code === 'ENOENT') {
            return null;
        }
        throw cause;
    }
}

async function clearStoredNoticeIfMatching(agentRoot: string, notice: string) {
    const path = pendingNoticePath(agentRoot);
    try {
        const value = JSON.parse(await readFile(path, 'utf8')) as { notice?: unknown };
        if (value.notice === notice) {
            await rm(path, { force: true });
        }
    } catch (cause) {
        if (!(isRecord(cause) && cause.code === 'ENOENT')) {
            throw cause;
        }
    }
}

function pendingNoticePath(agentRoot: string) {
    return join(agentRoot, 'runtime', 'pending-notice.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

/** Undelivered steering leaves the durable notice for the next turn. */
export async function steerInboxNotice(
    session: Pick<RuntimeSession, 'steer'>,
    notice: string,
    runtime: DaemonRuntime
): Promise<boolean> {
    const result = await session.steer(notice);
    if (result.delivered) {
        return true;
    }
    if (result.reason === 'failed') {
        await runtime.runPromise(
            Effect.logWarning('Inbox notice delivery failed; retained for the next turn.').pipe(
                Effect.annotateLogs({
                    event: 'inbox-notice-deferred',
                    errorType: result.error instanceof Error ? result.error.name : 'unknown',
                })
            )
        );
    }
    return false;
}
