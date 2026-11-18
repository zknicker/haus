import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChatSearch } from '../../features/servers/chat/chat-search.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverChatMessageRoute } from '../../features/servers/server-routes.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';

export function SearchRoute() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { server } = useServerContext();
    const handoffQuery = searchParams.get('q') ?? '';
    useWindowTitle('Search');
    return (
        <ChatSearch
            initialQuery={handoffQuery}
            // A new handoff is a new search intent, so the page starts over
            // rather than keeping the previous draft and filters.
            key={handoffQuery}
            onOpenResult={(result) =>
                navigate(serverChatMessageRoute(server.slug, result.chatId, result.id))
            }
            serverId={server.id}
        />
    );
}
