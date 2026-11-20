import type {
    ModelConnectionCapacityWindow,
    ModelProvider,
    RunnerConnectionCapacityFrame,
    RunnerModelConnection,
} from '@haus/api';
import { type ClaudeUsageWindowId, getClaudeUsage } from '@haus/claude-usage';
import { type CodexUsageWindowId, getCodexUsage } from '@haus/codex-usage';
import type { RunnerLink } from '../run-context.ts';
import type { ConnectionBook } from './connection-book.ts';

export const capacityReadEveryMs = 15 * 60 * 1000;
const accessFailureGapMs = 60 * 1000;

type Trigger = 'access-failure' | 'sweep';

const readGapMs: Record<Trigger, number> = {
    'access-failure': accessFailureGapMs,
    sweep: capacityReadEveryMs,
};

export interface CapacityUsageUrls {
    readonly chatgpt?: string;
    readonly claude?: string;
}

export type CapacityReader = ReturnType<typeof createCapacityReader>;

export function createCapacityReader(input: {
    book: ConnectionBook;
    link: RunnerLink;
    log: (line: string) => void;
    now?: () => Date;
    usageUrls?: CapacityUsageUrls;
}) {
    const now = input.now ?? (() => new Date());
    const lastRead = new Map<string, { at: number; credentialVersion: number }>();
    const reading = new Set<string>();
    const queues = new Map<ModelProvider, Promise<void>>();

    const readOne = async (connectionId: string) => {
        const connection = input.book.get(connectionId);
        if (!connection) {
            return;
        }
        const readAt = now();
        try {
            const windows = await readWindows(connection, readAt, input.usageUrls ?? {});
            const frame: RunnerConnectionCapacityFrame = {
                connectionId,
                readAt: readAt.toISOString(),
                type: 'runner-connection-capacity',
                windows,
            };
            input.link.send(frame);
        } catch (error) {
            input.log(
                `Runner could not read capacity for ${connectionId}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
        lastRead.set(connectionId, {
            at: now().getTime(),
            credentialVersion: connection.credentialVersion,
        });
    };

    const enqueue = (connection: RunnerModelConnection) => {
        reading.add(connection.id);
        const read = (queues.get(connection.provider) ?? Promise.resolve())
            .then(() => readOne(connection.id))
            .then(() => {
                reading.delete(connection.id);
            });
        queues.set(connection.provider, read);
        return read;
    };

    const due = (connection: RunnerModelConnection, trigger: Trigger, at: number) => {
        if (reading.has(connection.id)) {
            return false;
        }
        const last = lastRead.get(connection.id);
        return (
            !last ||
            last.credentialVersion !== connection.credentialVersion ||
            at - last.at >= readGapMs[trigger]
        );
    };

    return {
        afterAccessFailure(connectionId: string) {
            const connection = input.book.get(connectionId);
            return connection &&
                readsCapacity(connection) &&
                due(connection, 'access-failure', now().getTime())
                ? enqueue(connection)
                : Promise.resolve();
        },
        async sweep() {
            const listed = input.book.list().filter(readsCapacity);
            const ids = new Set(listed.map((connection) => connection.id));
            for (const connectionId of lastRead.keys()) {
                if (!ids.has(connectionId)) {
                    lastRead.delete(connectionId);
                }
            }
            const at = now().getTime();
            await Promise.all(
                listed.filter((connection) => due(connection, 'sweep', at)).map(enqueue)
            );
        },
    };
}

export function readsCapacity(connection: RunnerModelConnection) {
    return (
        (connection.provider === 'claude' && connection.credential.kind === 'setup-token') ||
        (connection.provider === 'chatgpt' && connection.credential.kind === 'oauth')
    );
}

async function readWindows(
    connection: RunnerModelConnection,
    readAt: Date,
    urls: CapacityUsageUrls
) {
    const { credential } = connection;
    if (credential.kind === 'setup-token') {
        const usage = await getClaudeUsage({
            credentials: {
                accessToken: credential.token,
                expiresAt: null,
                refreshToken: null,
                subscriptionType: null,
            },
            now: readAt,
            ...(urls.claude ? { usageUrl: urls.claude } : {}),
        });
        return usage.windows.map((window) => capacityWindow(window, claudeLabels[window.id]));
    }
    if (!(connection.provider === 'chatgpt' && credential.kind === 'oauth')) {
        throw new Error(
            `A ${connection.provider} ${credential.kind} connection has no capacity reader.`
        );
    }
    const { access, accountId, expires } = credential.credential;
    if (expires <= readAt.getTime()) {
        throw new Error('The access token has expired; the next turn refreshes it.');
    }
    const usage = await getCodexUsage({
        credentials: {
            accessToken: access,
            accountId: typeof accountId === 'string' ? accountId : null,
            lastRefresh: null,
            refreshToken: null,
        },
        now: readAt,
        ...(urls.chatgpt ? { usageUrl: urls.chatgpt } : {}),
    });
    return usage.windows.map((window) => capacityWindow(window, chatgptLabels[window.id]));
}

function capacityWindow(
    window: { id: string; resetsAt: string | null; usedPercent: number },
    label: string
) {
    const resetsAt = window.resetsAt === null ? Number.NaN : Date.parse(window.resetsAt);
    const mapped: ModelConnectionCapacityWindow = {
        id: window.id,
        label,
        resetsAt: Number.isFinite(resetsAt) ? new Date(resetsAt).toISOString() : null,
        usedPercent: window.usedPercent,
    };
    return mapped;
}

const claudeLabels: Record<ClaudeUsageWindowId, string> = {
    'current-session': '5-hour',
    'current-week-all-models': 'Weekly',
    'current-week-opus': 'Weekly Opus',
    'current-week-sonnet': 'Weekly Sonnet',
};

const chatgptLabels: Record<CodexUsageWindowId, string> = {
    'current-session': '5-hour',
    'current-week': 'Weekly',
};
