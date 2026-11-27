import type * as React from 'react';
import { openCaptain } from '../../../hooks/agents/use-open-captain.ts';
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
export function useDmActions({
    openFiles,
    openPath,
    slug,
}: ChatActionRoutes & {
    /** Opens the Captain's chat and panel: the surface's own navigate (a router, a tab, the sidebar). */
    openPath: (path: string) => void;
    slug: string;
}) {
    return {
        filesAvailable: Boolean(openFiles),
        run: ({ agentId, chatId }, key) => {
            if (key === 'profile' && agentId) {
                openCaptain(openPath, slug, agentId);
            } else if (key === 'files' && chatId) {
                openFiles?.(chatId);
            }
        },
    } satisfies DmActions;
}
