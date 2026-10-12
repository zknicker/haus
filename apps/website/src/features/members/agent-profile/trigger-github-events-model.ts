import {
    type GithubTriggerEvent,
    type GithubTriggerEventName,
    githubTriggerEventSchema,
    githubTriggerFilterValuesMax,
} from '@haus/api';

import {
    type ChoiceKey,
    githubEventSpecs,
    githubEventTextFields,
    type TextKey,
} from './trigger-github-event-specs.ts';

export {
    githubEventOrder,
    githubEventSpecs,
    githubEventTextFields,
} from './trigger-github-event-specs.ts';

/**
 * The closed GitHub event vocabulary as the Trigger form presents it
 * (specs/github-triggers.md#events): each event's actions with their default,
 * the enumerated filters offered as choices, and the free-text filters.
 */

/** One event entry as the form edits it; filters stay text until submit. */
export interface GithubEventDraft {
    actions: string[];
    authors: 'anyone' | 'collaborators';
    choices: Partial<Record<ChoiceKey, string[]>>;
    event: GithubTriggerEventName;
    key: string;
    texts: Partial<Record<TextKey, string>>;
}

export function createGithubEventDraft(event: GithubTriggerEventName): GithubEventDraft {
    return {
        key: crypto.randomUUID(),
        actions: [...githubEventSpecs[event].defaultActions],
        authors: 'collaborators',
        choices: {},
        event,
        texts: {},
    };
}

export function githubEventDraftFromEntry(entry: GithubTriggerEvent): GithubEventDraft {
    const draft = createGithubEventDraft(entry.event);
    const record: Record<string, unknown> = entry;
    if ('actions' in entry) {
        draft.actions = [...entry.actions];
    }
    if ('authors' in entry) {
        draft.authors = entry.authors;
    }
    for (const choice of githubEventSpecs[entry.event].choices) {
        const values = record[choice.key];
        if (Array.isArray(values)) {
            draft.choices[choice.key] = values.map(String);
        }
    }
    for (const text of githubEventTextFields(entry.event)) {
        const values = record[text.key];
        if (Array.isArray(values)) {
            draft.texts[text.key] = values.map(String).join(', ');
        }
    }
    return draft;
}

/** GitHub vocabulary reads in sentence case: `in_progress` → "In progress". */
export function githubValueLabel(value: string) {
    const words = value.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function splitFilterText(value: string) {
    return [
        ...new Set(
            value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
        ),
    ];
}

/**
 * The wire entry for one draft, or null when it cannot be sent: an event with
 * actions needs at least one, and each filter list holds at most twenty values.
 * An empty filter is omitted so it matches anything.
 */
export function githubEventFromDraft(draft: GithubEventDraft): GithubTriggerEvent | null {
    const spec = githubEventSpecs[draft.event];
    const entry: Record<string, unknown> = { event: draft.event };
    if (spec.actions.length > 0) {
        entry.actions = draft.actions;
    }
    if (spec.authors) {
        entry.authors = draft.authors;
    }
    for (const choice of spec.choices) {
        const values = draft.choices[choice.key] ?? [];
        if (values.length > 0) {
            entry[choice.key] = values;
        }
    }
    for (const text of githubEventTextFields(draft.event)) {
        const values = splitFilterText(draft.texts[text.key] ?? '');
        if (values.length > githubTriggerFilterValuesMax) {
            return null;
        }
        if (values.length > 0) {
            entry[text.key] = values;
        }
    }
    const parsed = githubTriggerEventSchema.safeParse(entry);
    return parsed.success ? parsed.data : null;
}

/**
 * What one event entry narrows to, for the detail view's row beside the
 * event's name: "completed · failure · main". An entry with nothing to narrow
 * matches every delivery of its event.
 */
export function githubEventSummary(entry: GithubTriggerEvent) {
    const parts: string[] = [];
    if ('actions' in entry && githubEventSpecs[entry.event].actions.length > 1) {
        parts.push(entry.actions.map(githubValueLabel).join(', ').toLowerCase());
    }
    parts.push(...filterValues(entry));
    return parts.length > 0 ? parts.join(' · ') : 'Any';
}

const summaryFilterKeys = [
    'conclusions',
    'states',
    'branches',
    'baseBranches',
    'labels',
    'workflows',
    'checkNames',
    'environments',
] as const;

function filterValues(entry: GithubTriggerEvent): string[] {
    const values: string[] = [];
    const record: Record<string, unknown> = entry;
    for (const key of summaryFilterKeys) {
        const list = record[key];
        if (Array.isArray(list) && list.length > 0) {
            values.push(list.map(String).join(', '));
        }
    }
    for (const text of githubEventTextFields(entry.event)) {
        if ((summaryFilterKeys as readonly string[]).includes(text.key)) {
            continue;
        }
        const list = record[text.key];
        if (Array.isArray(list) && list.length > 0) {
            values.push(`${text.label.toLowerCase()}: ${list.join(', ')}`);
        }
    }
    if (record.authors === 'anyone') {
        values.push('any author');
    }
    return values;
}
