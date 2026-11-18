import { Navigate } from 'react-router-dom';
import { readLastChatId, resolveEntryChat } from '../../features/servers/server-choice.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverChatRoute } from '../../features/servers/server-routes.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';

export function ServerDefaultPage() {
    const { server } = useServerContext();
    const chats = useChats(server.id);

    if (chats.isPending) {
        return null;
    }

    const chat = resolveEntryChat(chats.data ?? [], readLastChatId(server.slug));
    if (!chat) {
        return (
            <main className="flex h-full items-center justify-center px-6 text-center">
                <div>
                    <h1 className="text-foreground text-lg font-semibold">No Chats yet</h1>
                    <p className="text-muted mt-1 text-sm">
                        Create a Channel from the sidebar to begin.
                    </p>
                </div>
            </main>
        );
    }

    return <Navigate replace to={serverChatRoute(server.slug, chat.id)} />;
}
