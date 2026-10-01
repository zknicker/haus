import type { AppSection } from './server-route-state.ts';

export function cachedRouteModule<TModule>(load: () => Promise<TModule>) {
    let pending: Promise<TModule> | undefined;

    return () => {
        pending ??= load().catch((error: unknown) => {
            pending = undefined;
            throw error;
        });
        return pending;
    };
}

export const serverRouteModules = {
    agent: cachedRouteModule(() => import('./agent-page.tsx')),
    archivedChats: cachedRouteModule(() => import('./archived-chats-route.tsx')),
    chat: cachedRouteModule(() => import('./chat-route.tsx')),
    default: cachedRouteModule(() => import('./server-default-page.tsx')),
    inbox: cachedRouteModule(() => import('./inbox-page.tsx')),
    search: cachedRouteModule(() => import('./search-route.tsx')),
    settings: cachedRouteModule(() => import('./server-settings-page.tsx')),
    settingsSection: cachedRouteModule(() => import('./settings-route.tsx')),
    tasks: cachedRouteModule(() => import('./tasks-page.tsx')),
};

const routeModulesBySection: Record<
    AppSection,
    ReadonlyArray<() => Promise<Record<string, unknown>>>
> = {
    agent: [serverRouteModules.agent],
    chat: [serverRouteModules.chat, serverRouteModules.archivedChats],
    inbox: [serverRouteModules.inbox],
    search: [serverRouteModules.search],
    settings: [serverRouteModules.settings, serverRouteModules.settingsSection],
    tasks: [serverRouteModules.tasks],
};

/** Best-effort route warming. A failed preload is retried by the real navigation. */
export function preloadServerSection(section: AppSection) {
    for (const load of routeModulesBySection[section]) {
        load().catch(() => undefined);
    }
}

/** Warm the persistent shell's primary destinations once the browser is idle. */
export function preloadServerRoutes() {
    for (const section of Object.keys(routeModulesBySection) as AppSection[]) {
        preloadServerSection(section);
    }
}
