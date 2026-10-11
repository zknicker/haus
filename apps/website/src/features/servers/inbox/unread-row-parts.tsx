import type { Agent, Chat } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { MailOpen01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { InboxGlyphMark, InboxIdentityMark } from './inbox-row.tsx';

/** An Unread row's one action: read it without opening it. */
export function MarkReadAction({ onPress, title }: { onPress: () => void; title: string }) {
    return (
        <Tooltip delay={0}>
            <Button
                aria-label={`Mark read: ${title}`}
                isIconOnly
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <Icon icon={MailOpen01Icon} size={16} />
            </Button>
            <Tooltip.Content>Mark read</Tooltip.Content>
        </Tooltip>
    );
}

/** When the row last moved, in the trailing cluster. */
export function UnreadRowTime({ value }: { value: null | string }) {
    return (
        <span className="tabular-nums">
            <RelativeTime fallback="" value={value} />
        </span>
    );
}

/**
 * A Chat's mark on an Unread row — its Channel box, or its DM's face. A
 * Thread row wears its parent's, since the parent is the place it names.
 */
export function UnreadChatMark({
    agent,
    chat,
    name,
}: {
    agent: Agent | null;
    chat: Chat;
    name: string;
}) {
    return chat.kind === 'channel' ? (
        <InboxGlyphMark>
            <ChannelIconBox color={chat.color} icon={chat.icon} size="inboxRow" />
        </InboxGlyphMark>
    ) : (
        <InboxIdentityMark agent={agent} name={name} />
    );
}
