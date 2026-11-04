import type { TaskMention, TaskReminderRef } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import * as React from 'react';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useChatAppearances } from '../../hooks/servers/use-chats.ts';
import { useServerContext } from '../servers/server-context.ts';
import { useOpenTaskChat } from './use-open-task-chat.ts';

/**
 * What points at a Task, computed by the Server from references (ADR 0051):
 * the messages that mention it and the Reminders that name it. Each row opens
 * where that conversation lives. A section with nothing to list stays away.
 */

export function TaskMentions({ mentions }: { mentions: readonly TaskMention[] }) {
    const { server } = useServerContext();
    const chats = useChatAppearances(server.id);
    const openChat = useOpenTaskChat();

    return (
        <TaskLinkSection count={mentions.length} title="Mentioned in">
            {mentions.map((mention, index) => (
                <React.Fragment key={mention.messageId}>
                    {index > 0 ? <Separator /> : null}
                    <TaskLinkRow
                        onOpen={() => openChat(mention.chatId, mention.messageId)}
                        title={mention.excerpt}
                    >
                        <EntityAvatar name={mention.authorLabel} size="sm" />
                        <ItemCard.Content>
                            <ItemCard.Title>
                                {mentionPlace(mention, chats.get(mention.chatId)?.name)}
                                {' · '}
                                <RelativeTime value={mention.createdAt} />
                            </ItemCard.Title>
                            <ItemCard.Description>{mention.excerpt}</ItemCard.Description>
                        </ItemCard.Content>
                    </TaskLinkRow>
                </React.Fragment>
            ))}
        </TaskLinkSection>
    );
}

export function TaskReminders({ reminders }: { reminders: readonly TaskReminderRef[] }) {
    const openChat = useOpenTaskChat();

    return (
        <TaskLinkSection count={reminders.length} title="Reminders">
            {reminders.map((reminder, index) => (
                <React.Fragment key={reminder.reminderId}>
                    {index > 0 ? <Separator /> : null}
                    <TaskLinkRow
                        onOpen={() => openChat(reminder.anchorChatId)}
                        title={reminder.title}
                    >
                        <ItemCard.Content>
                            <ItemCard.Title>{reminder.title}</ItemCard.Title>
                            <ItemCard.Description>{reminderFact(reminder)}</ItemCard.Description>
                        </ItemCard.Content>
                    </TaskLinkRow>
                </React.Fragment>
            ))}
        </TaskLinkSection>
    );
}

function TaskLinkSection({
    children,
    count,
    title,
}: {
    children: React.ReactNode;
    count: number;
    title: string;
}) {
    if (count === 0) {
        return null;
    }
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    {title}
                    <span className="ms-2 text-muted tabular-nums">{count}</span>
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">{children}</ItemCardGroup>
        </ItemCardGroup>
    );
}

/** A stock ItemCard rendered as a button, per its Pressable pattern. */
function TaskLinkRow({
    children,
    onOpen,
    title,
}: {
    children: React.ReactNode;
    onOpen: () => void;
    title: string;
}) {
    return (
        <ItemCard<'button'>
            aria-label={title}
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onOpen}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {children}
        </ItemCard>
    );
}

/**
 * Who said it and where. A Thread reply's Chat is the Thread, which `chat.list`
 * does not carry, so the row says Thread rather than read each one's parent.
 */
function mentionPlace(mention: TaskMention, chatName: null | string | undefined) {
    if (mention.threadAnchorMessageId) {
        return `${mention.authorLabel} · Thread`;
    }
    return `${mention.authorLabel} · ${chatName ? `#${chatName}` : 'DM'}`;
}

function reminderFact(reminder: TaskReminderRef) {
    const kind = reminder.kind === 'recurring' ? 'Recurring' : 'One-time';
    return reminder.nextFireAt
        ? `${kind} · ${reminderTimeFormat.format(new Date(reminder.nextFireAt))}`
        : `${kind} · Finished`;
}

const reminderTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
});
