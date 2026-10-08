import type { Reminder } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { formatByteSize } from '../../../lib/format.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import { formatReminderTime } from './agent-reminder-model.ts';
import { AutomationFactRow } from './automation-fact-row.tsx';
import { formatReminderScheduleDetail, reminderKind } from './reminder-schedule-presentation.ts';

/**
 * When it runs, in the viewer's time. The schedule's own timezone lives here
 * and nowhere else: the row it was opened from stays one short line.
 */
export function ReminderScheduleGroup({ reminder }: { reminder: Reminder }) {
    const now = useRelativeNow();
    const schedule = formatReminderScheduleDetail(reminder, { now });

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Schedule</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <AutomationFactRow title={reminderKind(reminder) === 'once' ? 'Runs' : 'Next run'}>
                    {schedule.nextRun}
                </AutomationFactRow>
                <Separator />
                <AutomationFactRow title="Repeats">{schedule.repeats}</AutomationFactRow>
                <Separator />
                <AutomationFactRow title="Timezone">{schedule.timezone}</AutomationFactRow>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

/** What the Agent is asked to do when it wakes, in full. */
export function ReminderInstructionsGroup({ text }: { text: string }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Instructions</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        {/* The one place the full text reads, so it wraps. */}
                        <ItemCard.Description className="max-w-full whitespace-pre-wrap break-words">
                            {text}
                        </ItemCard.Description>
                    </ItemCard.Content>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

/**
 * Where the Reminder came from: the chat it was set in, when, and whether it
 * carries a script. Its owner is not a row — it is the Agent whose profile
 * this is.
 */
export function ReminderContextGroup({
    reminder,
    serverId,
    serverSlug,
}: {
    reminder: Reminder;
    serverId: string;
    serverSlug: string;
}) {
    const chats = useChats(serverId);
    const chat = chats.data?.find((candidate) => candidate.id === reminder.anchorChatId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Context</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <AutomationFactRow title="Set in">
                    <Link
                        className="font-medium text-accent"
                        to={serverChatRoute(serverSlug, reminder.anchorChatId)}
                    >
                        {/* Blank while chats load rather than flashing a fallback. */}
                        {chat ? chatPlace(chat) : chats.data ? 'Open chat' : ' '}
                    </Link>
                </AutomationFactRow>
                <Separator />
                <AutomationFactRow title="Created">
                    {formatReminderTime(reminder.createdAt)}
                </AutomationFactRow>
                {reminder.hasScript ? (
                    <>
                        <Separator />
                        <AutomationFactRow title="Script">
                            {`Attached · ${formatByteSize(reminder.scriptBytes)}`}
                        </AutomationFactRow>
                    </>
                ) : null}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
