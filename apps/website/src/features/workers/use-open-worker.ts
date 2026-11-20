import type { ActiveWorkerLocation } from '@haus/api';
import { useNavigate } from 'react-router-dom';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute } from '../servers/server-routes.ts';

export function useOpenWorker() {
    const navigate = useNavigate();
    const { server } = useServerContext();
    return createWorkerOpener({ navigate, slug: server.slug });
}

export interface WorkerOpenerDeps {
    navigate: (path: string, options: { state: unknown }) => void;
    slug: string;
}

export function createWorkerOpener(deps: WorkerOpenerDeps) {
    return (work: { id: string; location: ActiveWorkerLocation }) => {
        deps.navigate(serverChatRoute(deps.slug, work.location.chatId), {
            state: tabIntentState(currentOpenGesture()),
        });
    };
}
