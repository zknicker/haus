/** Shared by the profile frame and route preloading; dynamic imports share the module cache. */
export function loadAgentProfileContent() {
    return import('./agent-profile-content.tsx');
}
