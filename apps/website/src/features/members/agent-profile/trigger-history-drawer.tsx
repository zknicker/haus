import { TRIGGER_HISTORY_RETENTION_DAYS, type TriggerHistoryEntry } from '@haus/api';
import { Chip, Drawer } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import {
    TRIGGER_HISTORY_LIMIT,
    useAgentTriggerHistory,
} from '../../../hooks/members/use-agent-trigger-history.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { formatTriggerFireDetail, formatTriggerHistoryTime } from './agent-trigger-model.ts';

/**
 * One Agent-wide log of Trigger executions. It deliberately lives beside the
 * active Trigger list so removal cannot strand the fire history in a closed
 * detail drawer.
 */
export function TriggerHistoryDrawer({
    agentId,
    isOpen,
    onOpenChange,
    serverId,
    serverSlug,
}: {
    agentId: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    serverSlug: string;
}) {
    const history = useAgentTriggerHistory(serverId, agentId, isOpen);
    const rows = history.data;
    const columns = executionColumns(serverSlug);

    return (
        <Drawer.Backdrop isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
            <Drawer.Content placement="right">
                <Drawer.Dialog className="w-[42rem]">
                    <Drawer.CloseTrigger />
                    {/* The header's one muted line says how far back the
                        reader is looking; a footer line under a long table is
                        read after the answer it qualifies. */}
                    <Drawer.Header>
                        <Drawer.Heading>History</Drawer.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            {retentionNote(rows?.length ?? 0)}
                        </p>
                    </Drawer.Header>
                    <Drawer.Body>
                        <DataGrid
                            aria-label="Trigger executions"
                            columns={columns}
                            data={rows ?? []}
                            getRowId={(entry) => entry.fireId}
                            renderEmptyState={() =>
                                rows ? (
                                    <p className="py-6 text-muted text-sm">No executions yet.</p>
                                ) : null
                            }
                        />
                    </Drawer.Body>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}

function executionColumns(serverSlug: string): DataGridColumn<TriggerHistoryEntry>[] {
    return [
        {
            cell: (entry) => (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.title}</span>
                    {entry.triggerDeletedAt ? (
                        <Chip color="default" size="sm" variant="soft">
                            Removed
                        </Chip>
                    ) : null}
                </div>
            ),
            header: 'Trigger',
            id: 'title',
            isRowHeader: true,
            minWidth: 180,
        },
        {
            cell: (entry) => (
                <span className="text-muted tabular-nums">
                    {formatTriggerHistoryTime(entry.firedAt)}
                </span>
            ),
            header: 'Executed',
            id: 'firedAt',
            minWidth: 150,
        },
        {
            cell: (entry) => formatTriggerFireDetail(entry),
            cellClassName: 'text-muted',
            header: 'Payload',
            id: 'payload',
            minWidth: 150,
        },
        {
            align: 'end',
            cell: (entry) =>
                entry.answer ? (
                    <Link
                        className="font-medium text-accent"
                        to={serverChatRoute(serverSlug, entry.answer.chatId)}
                    >
                        Open
                    </Link>
                ) : (
                    <span className="text-muted">No answer</span>
                ),
            header: 'Answer',
            id: 'answer',
            minWidth: 90,
        },
    ];
}

function retentionNote(count: number) {
    const retention = `History is kept for ${TRIGGER_HISTORY_RETENTION_DAYS} days.`;
    return count >= TRIGGER_HISTORY_LIMIT
        ? `Showing the latest ${TRIGGER_HISTORY_LIMIT} · ${retention}`
        : retention;
}
