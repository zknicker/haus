import type { ComputerInventory, ComputerRuntimeId, UsageOverview } from '@haus/api';
import { Button, Chip, ProgressBar, Skeleton, Tooltip } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { ProviderMark } from '../../components/provider-mark.tsx';
import { formatTimestamp } from '../../lib/format.ts';
import { RuntimeIssueHelp } from './runtime-issue.tsx';
import { type DisplayPlanWindow, usageColor } from './runtime-plan-windows.ts';
import {
    buildRuntimeRow,
    type RuntimeUsageRow,
    runtimeOrder,
    staleUsageTimestamp,
} from './runtime-usage-row.ts';

/**
 * Runtimes render through the same DataGrid as Agents on this Computer, so the
 * two tables on the page share one header, surface, and row treatment instead of
 * reading as unrelated widgets. The grid carries detected runtimes only;
 * undetected ones are named in the section header, since they have no limit and
 * no reset to put in a row.
 */
export function DetectedRuntimeUsage({
    detectedRuntimeIds,
    onViewPiUsage,
    piAgentCount,
    usage,
    runtimeIssues = [],
    computerName = 'this Computer',
}: {
    detectedRuntimeIds: ComputerRuntimeId[];
    onViewPiUsage?: () => void;
    piAgentCount: number | null;
    usage: UsageOverview;
    runtimeIssues?: ComputerInventory['runtimeIssues'];
    computerName?: string;
}) {
    const detected = new Set(detectedRuntimeIds);
    const rows = runtimeOrder
        .filter((id) => detected.has(id))
        .map((id) => {
            const row = buildRuntimeRow(id, usage, piAgentCount);
            if (runtimeIssues.some((issue) => issue.runtimeId === id)) {
                row.issue = 'authentication';
            }
            return row;
        });

    if (rows.length === 0) {
        return <p className="text-muted text-sm">No runtimes detected.</p>;
    }

    return (
        <DataGrid
            aria-label="Runtimes on this Computer"
            columns={runtimeColumns(Date.now(), computerName, onViewPiUsage)}
            contentClassName="min-w-160"
            data={rows}
            getRowId={(item) => item.id}
        />
    );
}

export function DetectedRuntimeUsageSkeleton({
    detectedRuntimeIds,
}: {
    detectedRuntimeIds: ComputerRuntimeId[];
}) {
    if (detectedRuntimeIds.length === 0) {
        return <p className="text-muted text-sm">No runtimes detected.</p>;
    }

    return (
        <div aria-busy="true" className="grid gap-2">
            <span className="sr-only">Loading runtime usage</span>
            {detectedRuntimeIds.map((runtimeId) => (
                <Skeleton className="h-11 w-full rounded-xl" key={runtimeId} />
            ))}
        </div>
    );
}

function runtimeColumns(
    now: number,
    computerName: string,
    onViewPiUsage?: () => void
): DataGridColumn<RuntimeUsageRow>[] {
    return [
        {
            cell: (item) => (
                <div className="flex min-w-0 items-center gap-3">
                    <ProviderMark className="size-5 shrink-0 text-muted" provider={item.id} />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{item.title}</p>
                            {item.issue && (
                                <Chip
                                    color={item.issue === 'authentication' ? 'danger' : 'warning'}
                                    size="sm"
                                    variant="soft"
                                >
                                    {item.issue === 'authentication'
                                        ? 'Sign-in required'
                                        : 'Usage unavailable'}
                                </Chip>
                            )}
                        </div>
                        {!item.issue && staleUsageTimestamp(item, now) && (
                            <p className="text-muted text-xs">Usage out of date</p>
                        )}
                    </div>
                </div>
            ),
            header: 'Runtime',
            id: 'runtime',
            isRowHeader: true,
            minWidth: 180,
        },
        {
            cell: (item) =>
                item.window ? (
                    <UsageMeter label={`${item.title} ${item.window.label}`} window={item.window} />
                ) : (
                    <span className="truncate text-muted text-sm">
                        {item.issue ? '—' : item.status}
                    </span>
                ),
            header: 'Weekly limit',
            id: 'limit',
            minWidth: 240,
        },
        {
            // The burst window gets its own track. Inline beside the weekly meter
            // it stole width from one row's bar, which made the bars stop being
            // comparable.
            cell: (item) =>
                item.fiveHourWindow ? (
                    <Tooltip delay={300}>
                        <Tooltip.Trigger
                            aria-label={`5-hour limit, ${Math.round(item.fiveHourWindow.usedPercent)}% used.`}
                            className="flex w-full min-w-0"
                        >
                            <UsageMeter
                                label={`${item.title} 5-hour limit`}
                                window={item.fiveHourWindow}
                            />
                        </Tooltip.Trigger>
                        <Tooltip.Content showArrow>
                            <Tooltip.Arrow />
                            <p className="max-w-xs">{burstResetCopy(item.fiveHourWindow, now)}</p>
                        </Tooltip.Content>
                    </Tooltip>
                ) : (
                    <UnsupportedMeter />
                ),
            header: '5h limit',
            id: 'burst',
            minWidth: 190,
        },
        {
            align: 'end',
            cell: (item) => {
                const staleAt = staleUsageTimestamp(item, now);
                if (item.issue) {
                    return (
                        <div className="flex flex-col items-end gap-1">
                            <RuntimeIssueHelp
                                computerName={computerName}
                                issue={item.issue}
                                runtimeId={item.id}
                                title={item.title}
                            />
                            {item.capturedAt && (
                                <span className="text-muted text-xs">
                                    Last updated {formatTimestamp(item.capturedAt)}
                                </span>
                            )}
                        </div>
                    );
                }
                if (staleAt) {
                    return (
                        <span className="text-muted text-sm">
                            Last updated {formatTimestamp(staleAt)}
                        </span>
                    );
                }
                if (item.window?.resetsAt) {
                    return (
                        <span className="text-muted text-sm">
                            Resets {formatTimestamp(item.window.resetsAt)}
                        </span>
                    );
                }
                return item.id === 'pi' && onViewPiUsage ? (
                    <Button className="-my-1" onPress={onViewPiUsage} size="sm" variant="ghost">
                        View usage
                    </Button>
                ) : null;
            },
            header: 'Details',
            id: 'resets',
            minWidth: 150,
        },
    ];
}

function UsageMeter({ label, window }: { label: string; window: DisplayPlanWindow }) {
    return (
        <div className="flex w-full min-w-0 items-center gap-3">
            <ProgressBar
                aria-label={label}
                className="min-w-12 flex-1"
                // The bar used its own inline threshold while the shared helper
                // defines a warning tier at 75%, so a 75% week looked as calm as a
                // 7% one. One scale for every meter.
                color={usageColor(window.usedPercent)}
                value={window.usedPercent}
            >
                <ProgressBar.Track>
                    <ProgressBar.Fill />
                </ProgressBar.Track>
            </ProgressBar>
            <span className="w-10 shrink-0 text-right font-medium text-sm tabular-nums">
                {Math.round(window.usedPercent)}%
            </span>
        </div>
    );
}

/**
 * A runtime with no burst window keeps the meter's geometry so the column still
 * reads as one row of bars, but renders an inert track rather than a zero-value
 * ProgressBar — a 0% bar would announce "0%" and imply a limit that does not
 * exist. The track class comes from the design system, so it tracks the theme.
 */
function UnsupportedMeter() {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <div aria-hidden="true" className="progress-bar__track min-w-12 flex-1 opacity-40" />
            <span className="w-10 shrink-0 text-right text-muted text-sm">—</span>
            <span className="sr-only">No 5-hour limit</span>
        </div>
    );
}

function burstResetCopy(window: DisplayPlanWindow, now: number) {
    const used = `Rolling 5-hour limit, ${Math.round(window.usedPercent)}% used.`;
    return window.resetsAt
        ? `${used} ${Date.parse(window.resetsAt) <= now ? 'Reset' : 'Resets'} ${formatTimestamp(window.resetsAt)}.`
        : `${used} Reset time unavailable.`;
}
