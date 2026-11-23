import type { ModelConnection } from '@haus/api';
import type { DisplayPlanWindow } from '../../../usage/runtime-plan-windows.ts';
import type { ModelAccountMarkId } from './model-account-mark.tsx';
import { connectionName } from './model-connection-model.ts';

export interface PlanUsage {
    fiveHour: DisplayPlanWindow | null;
    problem: string | null;
    weekly: DisplayPlanWindow | null;
}

interface AccountBase extends PlanUsage {
    id: string;
    mark: ModelAccountMarkId;
    subtitle: string;
    title: string;
}

export type ConnectionTableRow =
    | (AccountBase & { connection: ModelConnection; kind: 'connection' })
    | (AccountBase & { kind: 'device' })
    | { connection: ModelConnection; id: string; kind: 'details' };

export type AccountRow = Exclude<ConnectionTableRow, { kind: 'details' }>;

export function connectionRows(connections: readonly ModelConnection[]) {
    return connections.map((connection) => {
        const row: AccountRow = {
            connection,
            fiveHour: capacityWindow(connection, ['current-session'], '5-hour'),
            id: connection.id,
            kind: 'connection',
            mark: connection.provider,
            problem: connection.status === 'failed' ? 'Failed' : null,
            subtitle: connection.isDefault
                ? `${connectionName(connection)} · Default`
                : connectionName(connection),
            title: connection.label,
            weekly: capacityWindow(
                connection,
                ['current-week-all-models', 'current-week'],
                'Weekly'
            ),
        };
        return row;
    });
}

export function rowChildren(row: ConnectionTableRow) {
    if (row.kind !== 'connection') {
        return undefined;
    }
    const details: ConnectionTableRow = {
        connection: row.connection,
        id: `${row.id}:details`,
        kind: 'details',
    };
    return [details];
}

export function failedConnectionIds(connections: readonly ModelConnection[]) {
    return connections
        .filter((connection) => connection.status === 'failed')
        .map((connection) => connection.id);
}

export function connectionCountLabel(count: number) {
    if (count === 0) {
        return 'No connections';
    }
    return count === 1 ? '1 connection' : `${count} connections`;
}

export function soonestReset(usage: Pick<PlanUsage, 'fiveHour' | 'weekly'>, now: number) {
    const upcoming = [usage.fiveHour?.resetsAt, usage.weekly?.resetsAt]
        .filter((resetsAt): resetsAt is string => Boolean(resetsAt))
        .map((resetsAt) => Date.parse(resetsAt))
        .filter((at) => at > now)
        .sort((left, right) => left - right);
    return upcoming[0] ?? null;
}

export function resetsIn(at: number, now: number) {
    const minutes = Math.max(1, Math.round((at - now) / 60_000));
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function capacityWindow(connection: ModelConnection, ids: readonly string[], label: string) {
    const window = connection.capacity?.find((candidate) => ids.includes(candidate.id));
    return window ? { ...window, label } : null;
}
