import type { Reminder, Trigger } from '@haus/api';

export interface AgentAutomationCounts {
    armedTriggers: number;
    scheduledReminders: number;
    total: number;
}

/**
 * What is still standing, not what has already run: a scheduled reminder is a
 * wake that is still coming, and an armed trigger is a door still open. Settled
 * reminders and disabled triggers are history, and the Automations tab's own
 * history drawers own them.
 */
export function countAgentAutomations(
    reminders: readonly Pick<Reminder, 'status'>[],
    triggers: readonly Pick<Trigger, 'status'>[]
): AgentAutomationCounts {
    const scheduledReminders = reminders.filter(
        (reminder) => reminder.status === 'scheduled'
    ).length;
    const armedTriggers = triggers.filter((trigger) => trigger.status === 'armed').length;
    return {
        armedTriggers,
        scheduledReminders,
        total: armedTriggers + scheduledReminders,
    };
}

/**
 * The Automations card's fact: what is standing, named by kind, with zero
 * halves dropped rather than read out as "0 armed".
 */
export function formatAutomationsFact(counts: AgentAutomationCounts): string {
    const parts = [
        counts.scheduledReminders > 0
            ? `${counts.scheduledReminders} ${pluralize(counts.scheduledReminders, 'reminder')}`
            : null,
        counts.armedTriggers > 0
            ? `${counts.armedTriggers} ${pluralize(counts.armedTriggers, 'trigger')}`
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : 'Nothing scheduled';
}

/**
 * Connections this Agent can actually use right now: granted, connected, and
 * carrying at least one tool. The one definition of "this Agent's connections"
 * — the hub card names this set, and the Connections section lists a
 * different set on purpose: every connection that is toggleable, granted or not.
 */
export function grantedAgentConnections<
    Connection extends {
        connected: boolean;
        grants: readonly { agentId: string }[];
        tools: readonly unknown[];
    },
>(connections: readonly Connection[], agentId: string): Connection[] {
    return connections.filter(
        (connection) =>
            connection.connected &&
            connection.tools.length > 0 &&
            connection.grants.some((grant) => grant.agentId === agentId)
    );
}

/** Skills are Agent-owned copies, reported by the Agent's Computer. */
export function agentSkillNames(
    agentSkills: readonly { agentId: string; skills: readonly { name: string }[] }[] | undefined,
    agentId: string
): string[] {
    return agentSkills?.find((entry) => entry.agentId === agentId)?.skills.map((s) => s.name) ?? [];
}

/**
 * A card names the first few members of a set and counts the rest, so the fact
 * stays one line at any width: `Atlas, BidBeacon +2`.
 */
export function formatNameList(names: readonly string[], visible = 2): string {
    if (names.length === 0) {
        return 'None';
    }
    const shown = names.slice(0, visible).join(', ');
    const rest = names.length - visible;
    return rest > 0 ? `${shown} +${rest}` : shown;
}

function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}
