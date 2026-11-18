import { useParams } from 'react-router-dom';
import { ChatFiles } from '../../features/servers/chat/chat-files.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useChatMessages } from '../../hooks/servers/use-chat-messages.ts';

/**
 * A chat's Attachments as a desktop page (`files/:chatId`): the Attachments list in a
 * centered reading column, read from the chat's transcript cache so it lists
 * the same loaded messages the chat shows.
 */
export function FilesPageRoute() {
    const { chatId = '' } = useParams();
    const { server } = useServerContext();
    const messages = useChatMessages(server.id, chatId);
    return (
        <section aria-label="Attachments" className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
                <ChatFiles messages={messages.data?.entries} />
            </div>
        </section>
    );
}
