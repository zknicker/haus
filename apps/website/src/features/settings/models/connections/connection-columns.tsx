import type { ModelConnection } from '@haus/api';
import type { DataGridColumn } from '@heroui-pro/react';
import { SettingsStatusChip } from '../../layout/settings-row-title.tsx';
import { ConnectionDetails, ConnectionMenu, LeftMeter } from './connection-row-parts.tsx';
import {
    type AccountRow,
    type ConnectionTableRow,
    type PlanUsage,
    resetsIn,
    soonestReset,
} from './connections-table-model.ts';
import { ModelAccountMark } from './model-account-mark.tsx';
import type { ConnectionAction } from './model-connection-model.ts';

export interface ConnectionTableActions {
    isOwner: boolean;
    now: number;
    onAction: (connection: ModelConnection, action: ConnectionAction) => void;
    onWebSearch: (connection: ModelConnection, enabled: boolean) => void;
    savingWebSearch: boolean;
}

export const expandColumnId = 'expand';

export function connectionColumns(actions: ConnectionTableActions) {
    return [
        {
            cell: (row) =>
                row.kind === 'details' ? (
                    <ConnectionDetails
                        connection={row.connection}
                        isOwner={actions.isOwner}
                        isSaving={actions.savingWebSearch}
                        onWebSearch={(enabled) => actions.onWebSearch(row.connection, enabled)}
                    />
                ) : (
                    <AccountCell row={row} />
                ),
            header: 'Account',
            id: 'account',
            isRowHeader: true,
            minWidth: 220,
        },
        {
            cell: (row) => <WindowCell row={row} window="fiveHour" />,
            header: '5h left',
            id: 'five-hour',
            minWidth: 110,
        },
        {
            cell: (row) => <WindowCell row={row} window="weekly" />,
            header: '7d left',
            id: 'weekly',
            minWidth: 110,
        },
        {
            cell: (row) =>
                row.kind === 'details' ? null : <ResetsCell now={actions.now} row={row} />,
            header: 'Resets',
            id: 'resets',
            minWidth: 70,
        },
        {
            align: 'end',
            cell: (row) =>
                row.kind === 'connection' && actions.isOwner ? (
                    <ConnectionMenu
                        connection={row.connection}
                        onAction={(action) => actions.onAction(row.connection, action)}
                    />
                ) : null,
            header: <span className="sr-only">Actions</span>,
            id: 'controls',
            minWidth: 56,
        },
        {
            cell: () => null,
            header: <span className="sr-only">Details</span>,
            id: expandColumnId,
            minWidth: 40,
        },
    ] satisfies DataGridColumn<ConnectionTableRow>[];
}

function AccountCell({ row }: { row: AccountRow }) {
    const off = row.kind === 'connection' && !row.connection.enabled;
    return (
        <span className="flex min-w-0 items-center gap-3">
            <ModelAccountMark account={row.mark} />
            <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="text-foreground truncate font-medium">{row.title}</span>
                    {off ? <SettingsStatusChip>Off</SettingsStatusChip> : null}
                </span>
                <span className="text-muted truncate text-sm">{row.subtitle}</span>
            </span>
        </span>
    );
}

function ResetsCell({ now, row }: { now: number; row: AccountRow }) {
    const at = row.problem ? null : soonestReset(row, now);
    return (
        <span className="text-muted text-sm tabular-nums">
            {at === null ? '—' : resetsIn(at, now)}
        </span>
    );
}

function WindowCell({ row, window }: { row: ConnectionTableRow; window: keyof PlanUsage }) {
    if (row.kind === 'details' || window === 'problem') {
        return null;
    }
    if (row.problem) {
        return window === 'fiveHour' ? (
            <SettingsStatusChip color="warning">{row.problem}</SettingsStatusChip>
        ) : null;
    }
    const shown = row[window];
    return shown ? (
        <LeftMeter label={row.title} window={shown} />
    ) : (
        <span className="text-muted text-sm">—</span>
    );
}
