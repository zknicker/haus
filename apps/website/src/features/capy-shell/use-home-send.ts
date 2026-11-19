import { useNavigate } from 'react-router-dom';
import { useChatMessageSend } from '../../hooks/servers/use-chat-message-send.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import { type HomeAsk, planHomeSend, sendHomeAsk } from './home-send.ts';

export function useHomeSend(serverId: string, slug: string) {
    const navigate = useNavigate();
    const send = useChatMessageSend();
    return (ask: HomeAsk) => {
        const plan = planHomeSend(ask);
        if (!plan) {
            return false;
        }
        navigate(serverChatRoute(slug, plan.chatId));
        void sendHomeAsk({ plan, send, serverId });
        return true;
    };
}
