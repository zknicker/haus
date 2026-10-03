import * as React from 'react';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useChat } from '../../hooks/servers/use-chat.ts';
import type { FilesTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { ClosableWorkspaceTab } from './closable-workspace-tab.tsx';
import { resolvePrimaryTabIdentity } from './primary-tab-identity.ts';
import { chatTabPlace } from './thread-workspace-tab.tsx';
import { PrimaryTabMark, WorkspaceTabMarkSlot } from './workspace-tab-mark.tsx';

/**
 * A chat's Files tab: "Files" beside its chat's mark. It stays mounted while
 * unselected, so it closes itself once its chat is gone.
 */
export function FilesWorkspaceTab({ tabRef }: { tabRef: FilesTabRef }) {
    const workspace = useBrowserWorkspace();
    const serverId = workspace?.serverId ?? '';
    const chat = useChat(serverId, tabRef.chatId);
    const peer = useAgent(serverId, chat.data?.peerAgentId ?? undefined).data ?? null;
    const closeTab = workspace?.closeTab;
    const missing = chat.error?.data?.code === 'NOT_FOUND';
    React.useEffect(() => {
        if (missing) {
            closeTab?.(tabRef, { remember: false });
        }
    }, [closeTab, missing, tabRef]);
    const place = chat.data ? chatTabPlace(chat.data) : null;
    return (
        <ClosableWorkspaceTab
            label="Files"
            mark={
                chat.data ? (
                    <PrimaryTabMark
                        identity={resolvePrimaryTabIdentity({
                            agent: peer,
                            chat: chat.data,
                            section: 'chat',
                        })}
                    />
                ) : (
                    <WorkspaceTabMarkSlot />
                )
            }
            tabRef={tabRef}
            tooltip={
                <>
                    <p>Files</p>
                    {place ? <p className="text-muted text-xs">{place} › files</p> : null}
                </>
            }
        />
    );
}
