import type { Chat } from '@haus/api';
import * as React from 'react';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useThreadAnchor } from '../../hooks/threads/use-thread-anchor.ts';
import { sameTab, type ThreadTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { chatNavigationName } from './chat-navigation-name.ts';
import { ClosableWorkspaceTab } from './closable-workspace-tab.tsx';
import { resolvePrimaryTabIdentity } from './primary-tab-identity.ts';
import { PrimaryTabMark, WorkspaceTabMarkSlot } from './workspace-tab-mark.tsx';

/**
 * A Thread tab: its root message's excerpt beside its chat's mark, blank while
 * either loads. The preview tab sets its title in italics until it is
 * pinned; double-clicking pins it. It stays mounted while unselected, so it
 * closes itself once the Thread's chat or anchor is gone.
 */
export function ThreadWorkspaceTab({ tabRef }: { tabRef: ThreadTabRef }) {
    const workspace = useBrowserWorkspace();
    const serverId = workspace?.serverId ?? '';
    const thread = useThreadAnchor(serverId, tabRef.chatId, tabRef.anchorMessageId);
    const peer = useAgent(serverId, thread.chat?.peerAgentId ?? undefined).data ?? null;
    const closeTab = workspace?.closeTab;
    const { missing } = thread;
    React.useEffect(() => {
        if (missing) {
            closeTab?.(tabRef, { remember: false });
        }
    }, [closeTab, missing, tabRef]);
    const chat = thread.chat;
    const label = thread.anchor ? threadTabLabel(thread.anchor.content) : '';
    const place = chat ? chatTabPlace(chat) : null;
    const preview = sameTab(workspace?.preview ?? null, tabRef);
    return (
        <ClosableWorkspaceTab
            className={preview ? 'workspace-tab--preview' : undefined}
            label={label}
            mark={
                chat ? (
                    <PrimaryTabMark
                        identity={resolvePrimaryTabIdentity({ agent: peer, chat, section: 'chat' })}
                    />
                ) : (
                    <WorkspaceTabMarkSlot />
                )
            }
            onDoubleClick={() => workspace?.pinTab(tabRef)}
            tabRef={tabRef}
            tooltip={
                label ? (
                    <>
                        <p>{label}</p>
                        {place ? <p className="text-muted text-xs">{place} › thread</p> : null}
                    </>
                ) : null
            }
        />
    );
}

/** The root message's first line, or a plain name when it has no text (an attachment). */
function threadTabLabel(content: string): string {
    return messagePreviewLine(content) || 'Thread';
}

/** The chat as context: a channel by name; a DM as "DM", its Agent already shown by the mark. */
export function chatTabPlace(chat: Chat): string {
    return chat.kind === 'channel' ? `#${chatNavigationName(chat, null)}` : 'DM';
}
