import * as React from 'react';

type AgentProfileContent = typeof import('./agent-profile-content.tsx');

let loaded: AgentProfileContent | undefined;

/** Shared by the profile frame and route preloading; dynamic imports share the module cache. */
export function loadAgentProfileContent(): Promise<AgentProfileContent> {
    return import('./agent-profile-content.tsx').then((module) => {
        loaded = module;
        return module;
    });
}

/**
 * The content module once any load has finished. The Server shell warms it on
 * idle, so a profile normally renders it directly in its first commit; only a
 * cold open falls back to a lazy boundary.
 */
export function readLoadedAgentProfileContent(): AgentProfileContent | undefined {
    return loaded;
}

/**
 * {@link readLoadedAgentProfileContent} as of this component's mount. Decided
 * once: swapping a lazy boundary for the loaded module later would remount it.
 */
export function useLoadedAgentProfileContent(): AgentProfileContent | undefined {
    const [content] = React.useState(readLoadedAgentProfileContent);
    return content;
}
