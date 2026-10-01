import type { Agent, Chat } from '@haus/api';
import type { AppSection } from '../../routes/app/server-route-state.ts';

/**
 * Who the primary workspace tab stands for. The tab borrows the identity the
 * sidebar already shows — a channel's own icon and color, a DM's Agent avatar,
 * a section's glyph — so one union carries exactly the fields each mark needs.
 */
export type PrimaryTabIdentity =
    | { kind: 'channel'; color: string | null; icon: string | null; label: string }
    | { kind: 'dm'; avatarUrl: string | null; label: string }
    | { kind: 'section'; label: string; section: AppSection };

const sectionLabels: Record<AppSection, string> = {
    agent: 'Agent',
    chat: 'Chat',
    inbox: 'Inbox',
    search: 'Search',
    settings: 'Settings',
    tasks: 'Tasks',
};

/**
 * Resolves the primary tab from the routed section plus whatever the route
 * selected: an open chat, or an Agent whose DM has no chat record yet.
 */
export function resolvePrimaryTabIdentity({
    agent,
    chat,
    section,
}: {
    agent: Pick<Agent, 'avatarUrl' | 'displayName'> | null;
    chat: Pick<Chat, 'color' | 'icon' | 'kind' | 'name' | 'peerAgentDisplayName'> | null;
    section: AppSection;
}): PrimaryTabIdentity {
    if (chat?.kind === 'channel') {
        return {
            kind: 'channel',
            color: chat.color,
            icon: chat.icon,
            label: chat.name ?? 'Channel',
        };
    }
    if (chat?.kind === 'dm' || (section === 'chat' && agent)) {
        return {
            kind: 'dm',
            avatarUrl: agent?.avatarUrl ?? null,
            label: agent?.displayName ?? chat?.peerAgentDisplayName ?? chat?.name ?? 'DM',
        };
    }
    return { kind: 'section', label: sectionLabels[section], section };
}
