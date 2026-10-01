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
    'workspace',
    'activity',
] as const;

export type AgentSection = (typeof agentSections)[number];

export function isAgentSection(value: string | undefined): value is AgentSection {
    return agentSections.some((section) => section === value);
}
