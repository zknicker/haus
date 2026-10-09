import type * as React from 'react';
import { agentProfileRoute, tasksRoute } from '../server-routes.ts';
import type { ChatActionRoutes } from './use-channel-actions.tsx';

/** The DM a menu opened on; an implicit Agent DM has no chat yet. */
export interface DmActionTarget {
    agentId: string | null;
    chatId: string | null;
}

export interface DmActions {
    filesAvailable: boolean;
    run: (target: DmActionTarget, key: React.Key) => void;
}

/** Every DM menu's actions: the web topbar's •••, the sidebar row, and a desktop tab. */
export function useDmActions({ openFiles, openPath, slug }: ChatActionRoutes & { slug: string }) {
    return {
        filesAvailable: Boolean(openFiles),
        run: ({ agentId, chatId }, key) => {
            if (key === 'profile' && agentId) {
                openPath(agentProfileRoute(slug, agentId));
            } else if (key === 'tasks' && chatId) {
                openPath(`${tasksRoute(slug)}?chat=${encodeURIComponent(chatId)}`);
            } else if (key === 'files' && chatId) {
                openFiles?.(chatId);
            }
        },
    } satisfies DmActions;
}
