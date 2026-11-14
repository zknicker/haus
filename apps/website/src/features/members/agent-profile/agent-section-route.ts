import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { type AgentSection, canOpenAgentSection, isAgentSection } from './agent-sections.ts';

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

/**
 * The same read for a viewer: a section their role cannot open falls back to
 * the hub exactly as an unknown segment does, so a Member's link to Permissions
 * lands home rather than on a gate.
 */
export function resolveAgentSectionParamForRole(
    value: string | undefined,
    role: ServerDetail['role']
): ReturnType<typeof resolveAgentSectionParam> {
    const resolved = resolveAgentSectionParam(value);
    return canOpenAgentSection(resolved.section, role)
        ? resolved
        : { kind: 'redirect', section: 'home' };
}
