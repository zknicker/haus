import type { Chat } from '@haus/api';
import { Button, Chip, Tooltip } from '@heroui/react';
import { SidebarRightIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { SectionHeader, shellBandIconSize } from '../../shell/section-header.tsx';
import { ChannelActions } from './channel-actions.tsx';
import { DmActions } from './dm-actions.tsx';

/** The web chat's topbar band. Desktop tabs render none (see ChatView). */
export function ChatTopbar({
    artifactVisible,
    chat,
    chatName,
    onOpenFiles,
    onToggleArtifacts,
    server,
}: {
    artifactVisible: boolean;
    chat: Chat;
    chatName: string;
    onOpenFiles: () => void;
    onToggleArtifacts: () => void;
    server: ServerDetail;
}) {
    const agents = useAgents(chat.serverId);
    const peerAgent =
        chat.kind === 'dm' && chat.peerAgentId
            ? (agents.data?.find((agent) => agent.id === chat.peerAgentId) ?? null)
            : null;

    const actions =
        chat.kind === 'channel' ? (
            <ChannelActions
                chat={chat}
                chatName={chatName}
                onOpenFiles={onOpenFiles}
                server={server}
            />
        ) : (
            <DmActions
                chatName={chatName}
                content={{ chatId: chat.id, onOpenFiles }}
                peerAgent={peerAgent}
                slug={server.slug}
            />
        );
    return (
        <SectionHeader
            leading={
                <ChatTopbarIdentity
                    mark={
                        chat.kind === 'channel' ? (
                            <ChannelIconBox color={chat.color} icon={chat.icon} size="topbar" />
                        ) : (
                            <EntityAvatar
                                name={peerAgent?.displayName ?? chatName}
                                size={24}
                                src={peerAgent?.avatarUrl ?? null}
                            />
                        )
                    }
                    name={chatName}
                />
            }
            meta={<ChatTopbarMeta chat={chat} />}
        >
            {/* Contextual actions first; the pane toggle keeps the far end. */}
            {actions}
            <Tooltip>
                <Button
                    aria-label={artifactVisible ? 'Hide artifacts' : 'Show artifacts'}
                    isIconOnly
                    onPress={onToggleArtifacts}
                    size="sm"
                    variant={artifactVisible ? 'secondary' : 'ghost'}
                >
                    <Icon aria-hidden="true" icon={SidebarRightIcon} size={shellBandIconSize} />
                </Button>
                <Tooltip.Content>
                    {artifactVisible ? 'Hide artifacts' : 'Show artifacts'}
                </Tooltip.Content>
            </Tooltip>
        </SectionHeader>
    );
}

/**
 * The web topbar's static chat identity: mark and name as the page heading.
 * The actions menu lives at the band's end, so the identity is not a control.
 */
export function ChatTopbarIdentity({ mark, name }: { mark: React.ReactNode; name: string }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            {mark}
            <h1 className="min-w-0 truncate font-semibold text-sm">{name}</h1>
        </div>
    );
}

export function ChatTopbarMeta({
    chat,
}: {
    chat: Pick<Chat, 'archivedAt' | 'kind' | 'peerAgentRetired'>;
}) {
    if (chat.kind === 'dm' && chat.peerAgentRetired) {
        return <Chip size="sm">Retired</Chip>;
    }
    if (chat.archivedAt) {
        return <Chip size="sm">Archived</Chip>;
    }
    return null;
}
