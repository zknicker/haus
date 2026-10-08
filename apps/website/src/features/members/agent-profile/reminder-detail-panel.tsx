import { REMINDER_HISTORY_RETENTION_DAYS, type Reminder } from '@haus/api';
import { Button } from '@heroui/react';
import { Sheet } from '@heroui-pro/react';
import * as React from 'react';
import { useReminderCancel } from '../../../hooks/members/use-reminder-cancel.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { reminderDescription } from './agent-reminder-model.ts';
import { AutomationConfirmDialog } from './automation-confirm-dialog.tsx';
import {
    ReminderContextGroup,
    ReminderInstructionsGroup,
    ReminderScheduleGroup,
} from './reminder-detail-groups.tsx';
import { ReminderRunHistory } from './reminder-run-history.tsx';
import { reminderKind, reminderKindLabel } from './reminder-schedule-presentation.ts';

/**
 * One Reminder. The header names it and says which of the two kinds it is;
 * the body answers, in order, when it runs, what it will do, where it came
 * from, and — for a recurring one — how its past runs went. A one-time
 * Reminder that is still scheduled has by definition never run, so it carries
 * no history group to sit empty.
 */
export function ReminderDetailPanel({
    agentId,
    agentName,
    onClose,
    reminder,
    serverId,
    serverSlug,
}: {
    agentId: string;
    agentName: string;
    onClose: () => void;
    reminder: Reminder;
    serverId: string;
    serverSlug: string;
}) {
    const cancel = useReminderCancel(serverId, agentId);
    const [isConfirming, setConfirming] = React.useState(false);
    const kind = reminderKind(reminder);
    const instructions = reminderDescription(reminder);

    return (
        <>
            <Sheet.Header>
                <Sheet.Heading>{reminder.title}</Sheet.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">{reminderKindLabel(kind)}</p>
            </Sheet.Header>
            <Sheet.Body>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
                    <ReminderScheduleGroup reminder={reminder} />
                    {instructions ? <ReminderInstructionsGroup text={instructions} /> : null}
                    <ReminderContextGroup
                        reminder={reminder}
                        serverId={serverId}
                        serverSlug={serverSlug}
                    />
                    {kind === 'recurring' ? (
                        <ReminderRunHistory reminderId={reminder.id} serverId={serverId} />
                    ) : null}
                    <SettingsRowError>{cancel.error?.message ?? null}</SettingsRowError>
                </div>
            </Sheet.Body>
            <Sheet.Footer>
                <Button
                    isDisabled={cancel.isPending}
                    onPress={() => setConfirming(true)}
                    type="button"
                    variant="danger-soft"
                >
                    Cancel Reminder
                </Button>
                <Button onPress={onClose} type="button" variant="secondary">
                    Close
                </Button>
            </Sheet.Footer>
            <AutomationConfirmDialog
                body={
                    kind === 'once'
                        ? `${agentName} will not be woken for it.`
                        : `${agentName} will not be woken for it again. Past runs stay in History for ${REMINDER_HISTORY_RETENTION_DAYS} days.`
                }
                confirmLabel="Cancel Reminder"
                dismissLabel="Keep"
                heading={`Cancel ${reminder.title}?`}
                isOpen={isConfirming}
                isPending={cancel.isPending}
                onConfirm={() => {
                    // Success removes the reminder from the schedule, which
                    // closes this sheet on its own.
                    void cancel
                        .cancel(reminder)
                        .catch(() => undefined)
                        .finally(() => setConfirming(false));
                }}
                onOpenChange={(open) => !open && setConfirming(false)}
                status="danger"
            />
        </>
    );
}
