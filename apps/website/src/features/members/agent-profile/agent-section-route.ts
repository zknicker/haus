import { type AgentSection, isAgentSection } from './agent-sections.ts';

/**
 * The profile's tabs before the hub (ADR 0038), mapped to the section that now
 * holds each: Overview became the hub, Setup's first fact is what the Agent
 * runs on, and the Instructions section was renamed Profile. Old links and bookmarks keep landing somewhere sensible.
 */
const retiredTabs: ReadonlyMap<string, AgentSection> = new Map([
    ['instructions', 'profile'],
    ['overview', 'home'],
    ['setup', 'runtime'],
]);

/**
 * Reads the route's section segment: a current section renders as-is, a
 * retired tab or unknown value names the section to redirect to.
 */
export function resolveAgentSectionParam(
    value: string | undefined
): { kind: 'redirect'; section: AgentSection } | { kind: 'section'; section: AgentSection } {
    if (isAgentSection(value)) {
        return { kind: 'section', section: value };
    }
    return { kind: 'redirect', section: retiredTabs.get(value ?? '') ?? 'home' };
}
