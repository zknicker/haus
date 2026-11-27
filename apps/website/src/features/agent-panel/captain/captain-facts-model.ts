import type { Reminder, Trigger } from '@haus/api';

export interface AgentAutomationCounts {
    armedTriggers: number;
    scheduledReminders: number;
    total: number;
}

export function countAgentAutomations(
    reminders: readonly Pick<Reminder, 'status'>[],
    triggers: readonly Pick<Trigger, 'status'>[]
) {
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

export function formatAutomationsFact(counts: AgentAutomationCounts) {
    const parts = [
        counts.scheduledReminders > 0
            ? `${counts.scheduledReminders} ${pluralize(counts.scheduledReminders, 'reminder')}`
            : null,
        counts.armedTriggers > 0
            ? `${counts.armedTriggers} ${pluralize(counts.armedTriggers, 'trigger')}`
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : nothingScheduled;
}

export function formatAllSettingsFact(counts: AgentAutomationCounts, skills: number) {
    const automations = formatAutomationsFact(counts);
    const parts = [
        automations === nothingScheduled ? null : automations,
        skills > 0 ? `${skills} ${pluralize(skills, 'skill')}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : nothingScheduled;
}

export function grantedAgentConnections<
    Connection extends {
        connected: boolean;
        grants: readonly { agentId: string }[];
        tools: readonly unknown[];
    },
>(connections: readonly Connection[], agentId: string) {
    return connections.filter(
        (connection) =>
            connection.connected &&
            connection.tools.length > 0 &&
            connection.grants.some((grant) => grant.agentId === agentId)
    );
}

export function agentSkillNames(
    agentSkills: readonly { agentId: string; skills: readonly { name: string }[] }[] | undefined,
    agentId: string
) {
    return agentSkills?.find((entry) => entry.agentId === agentId)?.skills.map((s) => s.name) ?? [];
}

export function formatNameList(names: readonly string[], visible = 2) {
    if (names.length === 0) {
        return noNames;
    }
    const shown = names.slice(0, visible).join(', ');
    const rest = names.length - visible;
    return rest > 0 ? `${shown} +${rest}` : shown;
}

export function isUnsetFact(fact: string | undefined) {
    return fact === noNames || fact === nothingScheduled;
}

const noNames = 'None';
const nothingScheduled = 'Nothing scheduled';

function pluralize(count: number, singular: string) {
    return count === 1 ? singular : `${singular}s`;
}
