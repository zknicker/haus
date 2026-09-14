import { REMINDER_HISTORY_RETENTION_DAYS, type ReminderHistoryEntry } from '@haus/api';
import { Chip, Drawer } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import {
    REMINDER_HISTORY_LIMIT,
    useAgentReminderHistory,
} from '../../../hooks/members/use-agent-reminder-history.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import {
    formatReminderCadence,
    formatReminderTime,
    reminderExecutionOutcome,
} from './agent-reminder-model.ts';

/**
 * History is a log of executions, not a list of settled reminders: one row per
 * fire, so a recurring reminder appears every time it woke. That makes it a
 * table rather than a second list of cards — five short facts per row, scanned
 * down a column rather than read row by row.
 *
 * It is also the section's one rare action, so it opens on demand and fetches
 * on demand: the Automations tab loads a schedule, and nothing else, until
 * someone asks "did it actually fire?".
 */
export function ReminderHistoryDrawer({
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
    const history = useAgentReminderHistory(serverId, agentId, isOpen);
    const rows = history.data;
    const columns = executionColumns(serverSlug);

    return (
        <Drawer.Backdrop isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
            {/* The stock right drawer is sized for a form. Five columns of
                log need more measure than that, so the dialog carries its
                own width the way the Trigger sheet does. */}
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
                            aria-label="Reminder executions"
                            columns={columns}
                            data={rows ?? []}
                            getRowId={(entry) => entry.fireId}
                            renderEmptyState={() =>
                                // Blank until the read settles: "no
                                // executions yet" is only true once the
                                // Server has answered.
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

/**
 * The reminder is named once per row and everything else is a fact about that
 * one wake, so the columns read left to right as: which reminder, when it woke,
 * how often it wakes, what it produced, and where the answer went.
 */
function executionColumns(serverSlug: string): DataGridColumn<ReminderHistoryEntry>[] {
    return [
        {
            accessorKey: 'title',
            cellClassName: 'font-medium',
            header: 'Reminder',
            id: 'title',
            isRowHeader: true,
            minWidth: 160,
        },
        {
            cell: (entry) => (
                <span className="tabular-nums">{formatReminderTime(entry.firedAt)}</span>
            ),
            cellClassName: 'text-muted',
            header: 'Executed',
            id: 'firedAt',
            minWidth: 150,
        },
        {
            cell: (entry) => formatReminderCadence(entry.repeat),
            cellClassName: 'text-muted',
            header: 'Cadence',
            id: 'repeat',
            minWidth: 100,
        },
        {
            cell: (entry) => <OutcomeCell entry={entry} />,
            header: 'Outcome',
            id: 'outcome',
            minWidth: 100,
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
                ) : null,
            header: 'Answer',
            id: 'answer',
            minWidth: 70,
        },
    ];
}

function OutcomeCell({ entry }: { entry: ReminderHistoryEntry }) {
    const outcome = reminderExecutionOutcome(entry);

    if (!outcome) {
        return null;
    }
    if (outcome.kind === 'note') {
        return <span className="text-muted">{outcome.label}</span>;
    }
    return (
        <Chip color={outcome.color} size="sm" variant="soft">
            {outcome.label}
        </Chip>
    );
}

/**
 * The log states its own end. A full answer is also a truncated one, so it says
 * how far back the reader is actually looking before it says when the Server
 * stops keeping any of it.
 */
function retentionNote(count: number) {
    const retention = `History is kept for ${REMINDER_HISTORY_RETENTION_DAYS} days.`;
    return count >= REMINDER_HISTORY_LIMIT
        ? `Showing the latest ${REMINDER_HISTORY_LIMIT} · ${retention}`
        : retention;
}
