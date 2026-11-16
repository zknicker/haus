import type { ServerDetail } from '../../../lib/haus-server.tsx';

/**
 * An Agent profile's sections. `home` is the hub; every other section is a
 * drill-down reached from a hub card or link, shown in the same tab or route
 * with a breadcrumb back to the hub (ADR 0038).
 */
export const agentSections = [
    'home',
    'runtime',
    'profile',
    'automations',
    'skills',
    'connections',
    'permissions',
    'workspace',
    'activity',
    'dreams',
] as const;

export type AgentSection = (typeof agentSections)[number];

/** Each drill-down's name in the profile's trail; the hub has none. */
export const agentSectionLabels: Record<Exclude<AgentSection, 'home'>, string> = {
    activity: 'Activity',
    automations: 'Automations',
    connections: 'Connections',
    dreams: 'Dreams',
    permissions: 'Permissions',
    profile: 'Profile',
    runtime: 'Runs on',
    skills: 'Skills',
    workspace: 'Workspace',
};

export function isAgentSection(value: string | undefined): value is AgentSection {
    return agentSections.some((section) => section === value);
}

/**
 * Permissions grant power over other Agents, so only an Owner or Admin can
 * open it; for a Member the section does not exist. Every other section is
 * open to every role.
 */
export function canOpenAgentSection(section: AgentSection, role: ServerDetail['role']): boolean {
    return section !== 'permissions' || role === 'owner' || role === 'admin';
}
