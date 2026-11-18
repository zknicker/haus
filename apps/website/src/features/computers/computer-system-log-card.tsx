import type { ComputerSystemEvent } from '@haus/api';
import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Pagination } from '@heroui/react';
import { InboxIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';

import { useComputerSystemLog } from '../../hooks/servers/use-computer-system-log.ts';
import { ComputerDataGridState } from './computer-data-grid-state.tsx';
import { systemEventLabel } from './computer-system-log.ts';

interface ComputerSystemEventRow {
    event: string;
    id: string;
    occurredAt: string;
}

type ComputerSystemLogGridState =
    | { status: 'loading' | 'ready' }
    | { onRetry: () => void; status: 'unavailable' };

export function ComputerSystemLog({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const [page, setPage] = useState(1);
    const systemLog = useComputerSystemLog(serverId, computerId, page);
    const events = systemLog.data?.events ?? [];
    const rows = events.map(systemEventRow);
    const gridState: ComputerSystemLogGridState =
        systemLog.data !== undefined
            ? { status: 'ready' }
            : systemLog.isError
              ? { onRetry: () => void systemLog.refetch(), status: 'unavailable' }
              : { status: 'loading' };

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>System Log</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {systemLog.data?.hasFrequentDisconnects ? (
                    <Alert status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Title>Frequent disconnects</Alert.Title>
                            <Alert.Description>
                                This Computer disconnected at least five times in the last five
                                minutes.
                            </Alert.Description>
                        </Alert.Content>
                    </Alert>
                ) : null}
                <ComputerSystemLogGrid rows={rows} state={gridState} />
                {systemLog.data && systemLog.data.total > systemLog.data.pageSize ? (
                    <ComputerSystemLogPagination
                        isPending={systemLog.isPlaceholderData}
                        onNext={() => setPage((current) => current + 1)}
                        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                        page={systemLog.data.page}
                        pageSize={systemLog.data.pageSize}
                        total={systemLog.data.total}
                    />
                ) : null}
            </ItemCardGroup>
        </section>
    );
}

export function ComputerSystemLogPagination({
    isPending,
    onNext,
    onPrevious,
    page,
    pageSize,
    total,
}: {
    isPending: boolean;
    onNext: () => void;
    onPrevious: () => void;
    page: number;
    pageSize: number;
    total: number;
}) {
    const firstEvent = (page - 1) * pageSize + 1;
    const lastEvent = Math.min(page * pageSize, total);

    return (
        <Pagination aria-label="System log pages" className="w-full" size="sm">
            <Pagination.Summary>
                Events {firstEvent}–{lastEvent} of {total}
            </Pagination.Summary>
            <Pagination.Content>
                <Pagination.Item>
                    <Pagination.Previous isDisabled={isPending || page === 1} onPress={onPrevious}>
                        <Pagination.PreviousIcon />
                        <span>Previous</span>
                    </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                    <Pagination.Next isDisabled={isPending || lastEvent === total} onPress={onNext}>
                        <span>Next</span>
                        <Pagination.NextIcon />
                    </Pagination.Next>
                </Pagination.Item>
            </Pagination.Content>
        </Pagination>
    );
}

export function ComputerSystemLogGrid({
    rows,
    state,
}: {
    rows: ComputerSystemEventRow[];
    state: ComputerSystemLogGridState;
}) {
    return (
        <DataGrid
            aria-label="Computer system log"
            columns={systemEventColumns}
            data={rows}
            getRowId={(item) => item.id}
            renderEmptyState={() => <ComputerSystemLogGridEmptyState state={state} />}
        />
    );
}

function ComputerSystemLogGridEmptyState({ state }: { state: ComputerSystemLogGridState }) {
    if (state.status === 'loading') {
        return <ComputerDataGridState label="Loading system log" status="loading" />;
    }
    if (state.status === 'unavailable') {
        return (
            <ComputerDataGridState
                label="System log unavailable"
                onRetry={state.onRetry}
                status="unavailable"
            />
        );
    }
    return (
        <ComputerDataGridState
            icon={InboxIcon}
            label="No system events recorded yet"
            status="empty"
        />
    );
}

function systemEventRow(event: ComputerSystemEvent): ComputerSystemEventRow {
    return { event: systemEventLabel(event), id: event.id, occurredAt: event.occurredAt };
}

const systemEventColumns: DataGridColumn<ComputerSystemEventRow>[] = [
    {
        accessorKey: 'event',
        header: 'Event',
        id: 'event',
        isRowHeader: true,
        minWidth: 220,
    },
    {
        align: 'end',
        cell: (item) => (
            <time className="text-muted tabular-nums" dateTime={item.occurredAt}>
                {formatTimestamp(item.occurredAt)}
            </time>
        ),
        header: 'Time',
        id: 'occurredAt',
        minWidth: 180,
    },
];

function formatTimestamp(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        timeZoneName: 'short',
        year: 'numeric',
    }).format(new Date(value));
}
