import * as React from 'react';
import { serverRouteModules } from '../../../routes/app/server-route-modules.ts';
import type { ChatView } from './chat-view.tsx';
import type { ImplicitAgentDmPage } from './implicit-agent-dm-page.tsx';

/** The code-split chat chunk (`routes/app/chat-page-content.tsx`). */
export interface ChatViewModule {
    ChatView: typeof ChatView;
    ImplicitAgentDmPage: typeof ImplicitAgentDmPage;
}

let loaded: ChatViewModule | undefined;
let pending: Promise<ChatViewModule> | undefined;

/** The chat chunk registers itself as it evaluates, so any preload makes it readable in render. */
export function registerChatViewModule(module: ChatViewModule) {
    loaded = module;
}

/**
 * The chat chunk's components, read synchronously once the chunk has loaded.
 * A `React.lazy` component suspends on its first render even when its chunk is
 * already in memory, which commits the fallback and engages Suspense's reveal
 * throttle on every fresh chat view; this suspends only on a genuinely cold
 * chunk, and always renders the same component types.
 */
export function useChatViewModule(): ChatViewModule {
    if (loaded) {
        return loaded;
    }
    pending ??= serverRouteModules.chat().then(
        (module) => {
            loaded = module;
            return module;
        },
        (error: unknown) => {
            pending = undefined;
            throw error;
        }
    );
    return React.use(pending);
}
