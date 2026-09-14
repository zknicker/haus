import type { Agent } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { getChannelColorStyle } from '../../../components/chats/channel-color-options.ts';
import { useChannelIconGlyph } from '../../../components/chats/channel-icon-catalog.ts';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentChats } from '../../../hooks/members/use-agent-chats.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { AgentLoading } from './agent-loading.tsx';

/** The chats this Agent belongs to — membership, not a chat surface. */
export function AgentChats({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const chats = useAgentChats(server.id, agent.id);
    const rows = chats.data ?? [];

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    Chats
                    {chats.data ? (
                        <span className="ms-2 text-muted tabular-nums">{rows.length}</span>
                    ) : null}
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {chats.isPending ? (
                    <AgentLoading label="Loading chats..." />
                ) : rows.length === 0 ? (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>No chats yet.</ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                ) : (
                    rows.map((chat, index) => (
                        <React.Fragment key={chat.id}>
                            {index > 0 ? <Separator /> : null}
                            <AgentChatRow
                                chat={chat}
                                fallbackName={`DM · @${agent.handle}`}
                                onOpen={() => navigate(serverChatRoute(server.slug, chat.id))}
                            />
                        </React.Fragment>
                    ))
                )}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

/**
 * Stock ItemCard rendered as a button, per its Pressable pattern. The handler
 * rides on ItemCard: `render` spreads the component's own props last.
 * `ItemCard.Icon` is already a filled, rounded box, so it carries only the
 * glyph — nesting a ChannelIconBox put a second box with its own radius
 * inside the slot's.
 */
function AgentChatRow({
    chat,
    fallbackName,
    onOpen,
}: {
    chat: NonNullable<ReturnType<typeof useAgentChats>['data']>[number];
    fallbackName: string;
    onOpen: () => void;
}) {
    const channelGlyph = useChannelIconGlyph(chat.icon);

    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onOpen}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {/* The slot is the one box; it carries the channel's configured
                color itself rather than nesting a ChannelIconBox inside. The
                `channel-icon-box` theme class resolves the color per theme. */}
            <ItemCard.Icon
                className={chat.kind === 'channel' ? 'channel-icon-box' : undefined}
                style={chat.kind === 'channel' ? getChannelColorStyle(chat.color) : undefined}
            >
                <Icon
                    aria-hidden="true"
                    icon={chat.kind === 'channel' ? channelGlyph : BubbleChatIcon}
                />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{chat.name ?? fallbackName}</ItemCard.Title>
            </ItemCard.Content>
        </ItemCard>
    );
}
