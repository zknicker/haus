/**
 * An App place's `path` holds UI labels exactly as rendered. A segment in
 * parentheses names a generic choice, such as "(your Computer)"; every other
 * segment is covered by an anchor that scripts/manual-app-places.test.ts
 * resolves against App source, so a renamed or removed control fails CI.
 */
export type AppPlaceRole = 'anyone' | 'owner-or-admin' | 'owner';

export type AppArea =
    | 'you'
    | 'people-and-agents'
    | 'channels'
    | 'agent-setup'
    | 'connections-and-computers'
    | 'server';

export interface AppPlace {
    anchors: readonly AppPlaceAnchor[];
    area: AppArea;
    note?: string;
    path: readonly string[];
    task: string;
    who: AppPlaceRole;
}

export type AppPlaceAnchor =
    /** An id in `settingsNavItems`; its label is the segment after "Settings". */
    | { kind: 'settings-section'; id: string }
    /** An id in `agentSections`; its label is the segment after "Agent profile". */
    | { kind: 'agent-section'; id: string }
    /** A route in `serverPageRoutes`, under `/s/:slug`. Covers no segment. */
    | { kind: 'page'; path: string }
    /** A repo-relative App source file that renders `text` as a UI label. */
    | { kind: 'label'; file: string; text: string };

/** Source files and anchors several places share, so a moved label is fixed in one spot. */
export const channelActionsMenu = 'features/servers/chat/channel-actions-menu.tsx';
export const agentTriggers = 'features/members/agent-profile/agent-triggers.tsx';
export const triggerManageGroup = 'features/members/agent-profile/trigger-manage-group.tsx';
export const computersGroup = 'features/computers/settings-computers-group.tsx';
export const secretsRow = 'features/computers/secrets-capability-row.tsx';

export function label(file: string, text: string): AppPlaceAnchor {
    return { kind: 'label', file: `apps/website/src/${file}`, text };
}

export function settingsEntry(): AppPlaceAnchor {
    return label('features/shell/sidebar-settings-action.tsx', 'Settings');
}

export function settingsSection(id: string): AppPlaceAnchor {
    return { kind: 'settings-section', id };
}

export function agentSection(id: string): AppPlaceAnchor {
    return { kind: 'agent-section', id };
}

export function agentProfile(): AppPlaceAnchor[] {
    return [
        label('features/members/agent-profile/agent-header.tsx', 'Agent profile'),
        { kind: 'page', path: 'agents/:agentId/:section' },
    ];
}

export function channelActions(): AppPlaceAnchor {
    return label('features/servers/chat/channel-actions.tsx', 'Channel actions');
}

export function computers(): AppPlaceAnchor {
    return label(computersGroup, 'Computers');
}

export function secrets(): AppPlaceAnchor {
    return label('features/computers/secrets-capability-card.tsx', 'Secrets');
}
