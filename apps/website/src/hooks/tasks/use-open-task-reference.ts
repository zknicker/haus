import { isTaskShortId } from '@haus/api';
import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { taskRoute } from '../../features/servers/server-routes.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { tabIntentState } from '../desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../desktop-tabs/tab-open-gesture.ts';

/** Opens a Task's page, `/tasks/<shortId>`, reading the short id when the caller has only the id. */
export function useOpenTaskReference(serverId: string) {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    const utils = hausTrpc.useUtils();
    const route = useRef({ navigate, serverId, slug, utils });
    route.current = { navigate, serverId, slug, utils };
    return useCallback(async ({ shortId, taskId }: { shortId?: string; taskId: string }) => {
        const gesture = currentOpenGesture();
        const current = route.current;
        const target =
            shortId ??
            (isTaskShortId(taskId)
                ? taskId
                : (await current.utils.task.get.fetch({ serverId: current.serverId, taskId }))
                      .shortId);
        current.navigate(taskRoute(current.slug, target), { state: tabIntentState(gesture) });
    }, []);
}
