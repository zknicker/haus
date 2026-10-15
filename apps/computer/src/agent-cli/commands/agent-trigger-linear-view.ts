import type { AgentTrigger, LinearTriggerDisplay, LinearTriggerGroup } from '@haus/api';

// How `haus trigger` prints a `linear` Trigger (specs/linear-triggers.md#agent-cli-and-manual):
// read-only, groups by display name, both suppressed counts. It has no URL and
// no secret.

type LinearAgentTrigger = Extract<AgentTrigger, { kind: 'linear' }>;

export function describeLinearTrigger(trigger: LinearAgentTrigger, fired: string): string {
    const { linear } = trigger;
    const problem = linear.problem ? ` · degraded: ${linear.problem.replaceAll('_', ' ')}` : '';
    return [
        `${trigger.id} [linear · ${trigger.status}${problem}] "${trigger.title}" — ${fired}, anchored in ${trigger.anchorTarget} — Linear ${linear.workspaceName}`,
        `  groups: ${linear.groups.map((group) => describeLinearGroup(group, linear.display)).join('; ')}`,
        `  suppressed over the rate limit: ${linear.suppressedCount}`,
        `  suppressed as your own changes: ${linear.selfSuppressedCount}`,
    ].join('\n');
}

/** `issue update stateTo=Design Review teams=Design`, filters in a stable order. */
export function describeLinearGroup(
    group: LinearTriggerGroup,
    display: LinearTriggerDisplay
): string {
    const parts: string[] = [group.event, group.actions.join(',')];
    for (const [name, value] of Object.entries(group).sort(([a], [b]) => a.localeCompare(b))) {
        if (name === 'event' || name === 'actions' || !Array.isArray(value)) {
            continue;
        }
        parts.push(`${name}=${value.map((item) => displayValue(item, display)).join(',')}`);
    }
    return parts.join(' ');
}

function displayValue(value: unknown, display: LinearTriggerDisplay): string {
    if (typeof value === 'string') {
        return display[value] ?? value;
    }
    if (value && typeof value === 'object' && 'agent' in value) {
        // A stored Agent selector is a Haus Agent id, not a handle.
        return `agent:${String(value.agent)}`;
    }
    if (value && typeof value === 'object' && 'linearUser' in value) {
        const id = String(value.linearUser);
        return display[id] ?? id;
    }
    return String(value);
}
