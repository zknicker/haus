import type { Agent } from '@haus/api';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { agentProfileRoute, tasksRoute } from '../server-routes.ts';
import type { ChatActionRoutes } from './use-channel-actions.tsx';

/** The DM a menu opened on; an implicit Agent DM has no chat yet. */
export interface DmActionTarget {
    agent: Agent | null;
    chatId: string | null;
}

export interface DmActions {
    filesAvailable: boolean;
    run: (target: DmActionTarget, key: React.Key) => void;
}

/** Every DM menu's actions: the web topbar's •••, the sidebar row, and a desktop tab. */
export function useDmActions({ openFiles, openPath, slug }: ChatActionRoutes & { slug: string }) {
    const navigate = useNavigate();
    const open = openPath ?? navigate;
    return {
        filesAvailable: Boolean(openFiles),
        run: ({ agent, chatId }, key) => {
            if (key === 'profile' && agent) {
                open(agentProfileRoute(slug, agent.id));
            } else if (key === 'tasks' && chatId) {
                open(`${tasksRoute(slug)}?chat=${encodeURIComponent(chatId)}`);
            } else if (key === 'files' && chatId) {
                openFiles?.(chatId);
            }
        },
    } satisfies DmActions;
}
