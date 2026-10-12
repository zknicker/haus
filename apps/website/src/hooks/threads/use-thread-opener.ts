import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverChatThreadRoute } from '../../features/servers/server-routes.ts';
import type { OpenGesture } from '../desktop-tabs/tab-open-gesture.ts';
import { useOpenThread } from './use-open-thread.ts';

/**
 * Opens a Thread from anywhere by its parent Chat and anchor: its page on
 * desktop (`useOpenThread`, ADR 0039), and on the website its Chat with
 * `?thread=`, where the Chat's side pane hosts it. A caller that opens after an
 * `await` passes the gesture it read at click time (`currentOpenGesture`).
 */
export function useThreadOpener(slug: string) {
    const openThread = useOpenThread();
    const navigate = useNavigate();
    return useCallback(
        (chatId: string, anchorMessageId: string, gesture?: OpenGesture) => {
            if (openThread) {
                openThread(chatId, anchorMessageId, gesture);
            } else {
                navigate(serverChatThreadRoute(slug, chatId, anchorMessageId));
            }
        },
        [navigate, openThread, slug]
    );
}
