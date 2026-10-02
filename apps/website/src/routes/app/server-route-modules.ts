import { loadAgentProfileContent } from '../../features/members/agent-profile/agent-profile-module.ts';
import type { AppSection } from './server-route-state.ts';

type ServerRouteShells = typeof import('./server-route-shells.tsx');
let loadedShells: ServerRouteShells | undefined;

/** The parent Server layout loads these before any destination can render. */
export function readServerRouteShells(): ServerRouteShells {
    if (!loadedShells) {
        throw new Error('The Server layout must load before its destination frames.');
    }
    return loadedShells;
}

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
    shell: cachedRouteModule(async () => {
        loadedShells = await import('./server-route-shells.tsx');
        return loadedShells;
    }),
    agent: cachedRouteModule(loadAgentProfileContent),
    chat: cachedRouteModule(() => import('./chat-page-content.tsx')),
    inbox: cachedRouteModule(() => import('./inbox-page-content.tsx')),
    settingsSection: cachedRouteModule(() => import('./settings-route.tsx')),
    tasks: cachedRouteModule(() => import('./tasks-page-content.tsx')),
};

const routeModulesBySection: Record<
    AppSection,
    ReadonlyArray<() => Promise<Record<string, unknown>>>
> = {
    agent: [serverRouteModules.agent],
    chat: [serverRouteModules.chat],
    inbox: [serverRouteModules.inbox],
    search: [],
    settings: [serverRouteModules.settingsSection],
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
