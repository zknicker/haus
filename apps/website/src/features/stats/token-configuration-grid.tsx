import { Card, Chip } from '@heroui/react';
import { DataGrid, type DataGridColumn, EmptyState, ItemCardGroup } from '@heroui-pro/react';
import { ChartHistogramIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { ConfigurationUsage } from './token-usage-view.ts';
import { formatPercent, formatTokens } from './usage-format.ts';

export function TokenConfigurationGrid({ rows }: { rows: ConfigurationUsage[] }) {
    const total = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    const columns: DataGridColumn<ConfigurationUsage>[] = [
        {
            cell: (item) => (
                <div className="flex items-center gap-3">
                    <EntityAvatar
                        className="shrink-0"
                        name={item.agentName}
                        size="sm"
                        src={item.agentAvatarUrl}
                    />
                    <div className="min-w-0">
                        <p className="truncate font-medium">{item.agentName}</p>
                        <p className="truncate text-muted text-sm">@{item.agentHandle}</p>
                    </div>
                </div>
            ),
            header: 'Agent',
            id: 'agentName',
            isRowHeader: true,
            minWidth: 160,
            sortFn: (a, b) => a.agentName.localeCompare(b.agentName),
            allowsSorting: true,
        },
        {
            cell: (item) => (
                <Chip size="sm" variant="soft">
                    <Chip.Label>{item.runtimeLabel}</Chip.Label>
                </Chip>
            ),
            header: 'Runtime',
            id: 'runtimeLabel',
            minWidth: 110,
            sortFn: (a, b) => a.runtimeLabel.localeCompare(b.runtimeLabel),
            allowsSorting: true,
        },
        {
            accessorKey: 'modelId',
            allowsSorting: true,
            cellClassName: 'font-mono',
            header: 'Model',
            id: 'modelId',
            minWidth: 160,
        },
        numericColumn('inputTokens', 'Input'),
        numericColumn('outputTokens', 'Output'),
        numericColumn('cacheReadTokens', 'Cache read'),
        {
            align: 'end',
            allowsSorting: true,
            cell: (item) => (
                <div className="flex flex-col items-end">
                    <p className="font-semibold tabular-nums">{formatTokens(item.totalTokens)}</p>
                    <p className="text-muted text-sm tabular-nums">
                        {formatPercent(total > 0 ? (item.totalTokens / total) * 100 : 0)}
                    </p>
                </div>
            ),
            header: 'Processed',
            id: 'totalTokens',
            minWidth: 105,
            sortFn: (a, b) => a.totalTokens - b.totalTokens,
        },
    ];

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Token usage detail</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {rows.length > 0 ? (
                <DataGrid
                    aria-label="Token usage by agent, runtime, and model"
                    columns={columns}
                    contentClassName="min-w-[800px]"
                    data={rows}
                    defaultSortDescriptor={{ column: 'totalTokens', direction: 'descending' }}
                    getRowId={(item) => item.id}
                />
            ) : (
                // Column headers with no rows read as a broken table, and the
                // seven-column scroll floor would push the message off a narrow
                // viewport, so the empty range drops the grid and keeps only the
                // panel the grid would have filled.
                <Card>
                    <Card.Content className="flex justify-center py-12">
                        <EmptyState>
                            <EmptyState.Header>
                                <EmptyState.Media variant="icon">
                                    <Icon className="size-5" icon={ChartHistogramIcon} />
                                </EmptyState.Media>
                                <EmptyState.Title>No token usage yet</EmptyState.Title>
                                <EmptyState.Description className="max-w-sm text-pretty">
                                    Once an Agent processes tokens in this range, this breaks the
                                    total down by Agent, runtime, and model.
                                </EmptyState.Description>
                            </EmptyState.Header>
                        </EmptyState>
                    </Card.Content>
                </Card>
            )}
        </ItemCardGroup>
    );
}

function numericColumn(
    id: 'cacheReadTokens' | 'inputTokens' | 'outputTokens',
    header: string
): DataGridColumn<ConfigurationUsage> {
    return {
        align: 'end',
        allowsSorting: true,
        cell: (item) => <p className="text-muted tabular-nums">{formatTokens(item[id])}</p>,
        header,
        id,
        minWidth: 85,
        sortFn: (a, b) => a[id] - b[id],
    };
}
