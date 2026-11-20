import type { ModelConnection } from '@haus/api';
import type { DataGridColumn } from '@heroui-pro/react';
import { Chip, Switch } from '@heroui/react';
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
    onEnabled: (connection: ModelConnection, enabled: boolean) => void;
    onWebSearch: (connection: ModelConnection, enabled: boolean) => void;
    savingEnabled: boolean;
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
                row.kind === 'connection' ? (
                    <ConnectionControls actions={actions} connection={row.connection} />
                ) : null,
            header: <span className="sr-only">Controls</span>,
            id: 'controls',
            minWidth: 96,
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
    return (
        <span className="flex min-w-0 items-center gap-3">
            <ModelAccountMark account={row.mark} />
            <span className="flex min-w-0 flex-col">
                <span className="text-foreground truncate font-medium">{row.title}</span>
                <span className="text-muted truncate text-xs">{row.subtitle}</span>
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
            <Chip color="danger" size="sm" variant="soft">
                <Chip.Label>{row.problem}</Chip.Label>
            </Chip>
        ) : null;
    }
    const shown = row[window];
    return shown ? (
        <LeftMeter label={row.title} window={shown} />
    ) : (
        <span className="text-muted text-sm">—</span>
    );
}

function ConnectionControls({
    actions,
    connection,
}: {
    actions: ConnectionTableActions;
    connection: ModelConnection;
}) {
    return (
        <span className="flex items-center justify-end gap-1">
            <Switch
                aria-label={`Use ${connection.label}`}
                isDisabled={!actions.isOwner || actions.savingEnabled}
                isSelected={connection.enabled}
                onChange={(enabled) => actions.onEnabled(connection, enabled)}
                size="sm"
            >
                <Switch.Content>
                    <Switch.Control>
                        <Switch.Thumb />
                    </Switch.Control>
                </Switch.Content>
            </Switch>
            {actions.isOwner ? (
                <ConnectionMenu
                    connection={connection}
                    onAction={(action) => actions.onAction(connection, action)}
                />
            ) : null}
        </span>
    );
}
