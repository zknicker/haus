import type { Chat } from '@haus/api';
import { Button, Chip, Tooltip } from '@heroui/react';
import { SidebarRightIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { SectionHeader, shellBandIconSize } from '../../shell/section-header.tsx';
import { ChannelActions } from './channel-actions.tsx';
import { DmActions } from './dm-actions.tsx';

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

    const compact = Boolean(getDesktopBridge()?.browserCommand);
    const actions =
        chat.kind === 'channel' ? (
            <ChannelActions
                chat={chat}
                chatName={chatName}
                compact={compact}
                onOpenFiles={onOpenFiles}
                server={server}
            />
        ) : (
            <DmActions
                chatName={chatName}
                compact={compact}
                content={{ chatId: chat.id, onOpenFiles }}
                peerAgent={peerAgent}
                slug={server.slug}
            />
        );
    if (compact) {
        return (
            <>
                {actions}
                <h1 className="sr-only">{chatName}</h1>
            </>
        );
    }
    return (
        <SectionHeader leading={actions} meta={<ChatTopbarMeta chat={chat} />}>
            {/* Both chat kinds carry their name inside the actions trigger, so
                the page needs an explicit heading for assistive tech. */}
            <h1 className="sr-only">{chatName}</h1>
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
