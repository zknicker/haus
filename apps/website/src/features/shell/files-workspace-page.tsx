import { useChatMessages } from '../../hooks/servers/use-chat-messages.ts';
import type { FilesTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { ChatFiles } from '../servers/chat/chat-files.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * A Files tab's body, in the side pane or full width: the chat's Files list in
 * a centered reading column. It reads the chat's transcript cache, so it lists
 * the same loaded messages the chat shows.
 */
export function FilesWorkspacePage({ tabRef }: { tabRef: FilesTabRef }) {
    const serverId = useBrowserWorkspace()?.serverId;
    const messages = useChatMessages(serverId, tabRef.chatId);
    return (
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
            <ChatFiles messages={messages.data?.messages} />
        </div>
    );
}
