import { createHash } from 'node:crypto';
import type { RunnerConnectionStatusFrame, RunnerModelConnection } from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import type { RunTurnResult } from '../turn/run-turn.ts';
import { SessionFailureError } from '../turn/turn-failure.ts';

const detailMax = 500;

export function createConnectionStatus(link: RunnerLink) {
    const lastSent = new Map<string, string>();
    return {
        afterTurn(connection: RunnerModelConnection, result: RunTurnResult) {
            const report = statusOf(result);
            if (!report) {
                return;
            }
            const sent = createHash('sha256')
                .update(JSON.stringify([report, connection.credential]))
                .digest('hex');
            if (lastSent.get(connection.id) === sent) {
                return;
            }
            lastSent.set(connection.id, sent);
            const frame: RunnerConnectionStatusFrame = {
                connectionId: connection.id,
                ...report,
                type: 'runner-connection-status',
            };
            link.send(frame);
        },
    };
}

function statusOf(result: RunTurnResult) {
    if (
        result.status === 'failed' &&
        result.failure instanceof SessionFailureError &&
        result.failure.category === 'access'
    ) {
        const detail = result.failure.message.trim().slice(0, detailMax).trim();
        return { status: 'failed' as const, ...(detail ? { detail } : {}) };
    }
    return result.status === 'completed' ? { status: 'ready' as const } : null;
}
