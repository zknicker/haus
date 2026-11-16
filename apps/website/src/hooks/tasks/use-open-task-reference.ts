import { parseTaskKey } from '@haus/api';
import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { taskRoute } from '../../features/servers/server-routes.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { tabIntentState } from '../desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../desktop-tabs/tab-open-gesture.ts';

/**
 * Opens the Task a reference names, from anywhere in the Server shell: a push
 * the router places (ADR 0039), honoring the click's own open gesture. A
 * reference that carries no key is read for it on the press, never on render.
 * The opener keeps one identity for the caller's lifetime, and reads only the
 * route's slug, so it works in a Thread dialog or a desktop tab alike.
 */
export function useOpenTaskReference(serverId: string) {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    const utils = hausTrpc.useUtils();
    const route = useRef({ navigate, serverId, slug, utils });
    route.current = { navigate, serverId, slug, utils };
    return useCallback(async ({ key, taskId }: { key?: string; taskId: string }) => {
        const gesture = currentOpenGesture();
        const current = route.current;
        const address = parseTaskKey(
            key ?? (await current.utils.task.get.fetch({ serverId: current.serverId, taskId })).key
        );
        if (address) {
            current.navigate(taskRoute(current.slug, address.boardKey, address.number), {
                state: tabIntentState(gesture),
            });
        }
    }, []);
}
