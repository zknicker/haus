import type { Agent, Chat } from '@haus/api';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import { chatNavigationName } from '../../shell/chat-navigation-name.ts';
import { SectionHeader } from '../../shell/section-header.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { useServerContext } from '../server-context.ts';

/** The destination's known identity while its conversation code or first detail read arrives. */
export function ChatPagePending({ chat, agent }: { chat?: Chat; agent?: Agent }) {
    const { server } = useServerContext();
    const humans = useHumanDirectory(server.id);
    const agents = useAgents(server.id);
    const peer = agent ?? agents.data?.find((candidate) => candidate.id === chat?.peerAgentId);
    const name = chat
        ? chat.kind === 'dm' && !chat.peerAgentId
            ? `DM · ${humans.name(chat.peerUserId)}`
            : chatNavigationName(chat, peer ?? null)
        : peer?.displayName;
    return (
        <section aria-busy="true" aria-label={name} className="relative flex min-h-0 flex-1">
            <PageTopbar>
                {name && !getDesktopBridge()?.browserCommand ? (
                    <SectionHeader
                        leading={
                            <div className="flex min-w-0 items-center gap-2">
                                {chat?.kind === 'channel' ? (
                                    <ChannelIconBox
                                        color={chat.color}
                                        icon={chat.icon}
                                        size="topbar"
                                    />
                                ) : (
                                    <EntityAvatar
                                        name={name}
                                        size={24}
                                        src={peer?.avatarUrl ?? null}
                                    />
                                )}
                                <h1 className="min-w-0 truncate font-semibold text-sm">{name}</h1>
                            </div>
                        }
                    />
                ) : null}
            </PageTopbar>
        </section>
    );
}
