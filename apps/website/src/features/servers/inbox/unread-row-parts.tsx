import type { Agent, Chat } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { MailOpen01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { AgentAvatar } from '../../members/agent-avatar.tsx';

/**
 * An Unread row's mark: the sidebar's own 24px — its Channel box and its DM
 * face — so a row names its place with the same mark the sidebar row does,
 * a step under the 32px faces of the messages an open row renders.
 */
const unreadMarkSize = 24;

/** An open Unread row's one action: read it without opening it (E), and move on. */
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

/** When the row last moved, in its line's trailing cluster. */
export function UnreadRowTime({ value }: { value: null | string }) {
    return (
        <span className="tabular-nums">
            <RelativeTime fallback="" value={value} />
        </span>
    );
}

/**
 * A Chat's mark on an Unread row — its Channel box, or its DM's face, or its
 * initials once the Agent is gone. A Thread row wears its parent's, since the
 * parent is the place it names.
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
    if (chat.kind === 'channel') {
        return (
            <span className="flex shrink-0">
                <ChannelIconBox color={chat.color} icon={chat.icon} size="sidebar" />
            </span>
        );
    }
    return (
        <span className="flex shrink-0">
            {agent ? (
                <AgentAvatar agent={agent} size={unreadMarkSize} />
            ) : (
                <EntityAvatar name={name} size={unreadMarkSize} src={null} />
            )}
        </span>
    );
}
