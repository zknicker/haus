import { parseTaskKey } from '@haus/api';
import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { taskRoute } from '../../features/servers/server-routes.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { tabIntentState } from '../desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../desktop-tabs/tab-open-gesture.ts';

export function useOpenTaskReference(serverId: string) {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    const utils = hausTrpc.useUtils();
    const route = useRef({ navigate, serverId, slug, utils });
    route.current = { navigate, serverId, slug, utils };
    return useCallback(async ({ key, taskId }: { key?: string; taskId: string }) => {
        const gesture = currentOpenGesture();
        const current = route.current;
        const taskKey =
            key ?? (await current.utils.task.get.fetch({ serverId: current.serverId, taskId })).key;
        if (parseTaskKey(taskKey)) {
            current.navigate(taskRoute(current.slug, taskKey), {
                state: tabIntentState(gesture),
            });
        }
    }, []);
}
