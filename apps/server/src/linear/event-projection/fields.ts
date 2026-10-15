import type { LinearIssueChangedField, LinearProjectChangedField } from '@haus/api';
import { field, type Payload, strings, text } from '../delivery-payload.ts';
import type { LinearLabelRef, LinearNamedRef, LinearStateRef } from './types.ts';

// Readers shared by the Linear projectors, written against the captured
// deliveries in apps/server/test/fixtures/linear/captured/.

/** Linear `updatedFrom` keys → Haus changed-field names for issues. */
const issueChangedKeys: Readonly<Record<string, LinearIssueChangedField>> = {
    assigneeId: 'assignee',
    delegateId: 'delegate',
    description: 'description',
    dueDate: 'dueDate',
    estimate: 'estimate',
    labelIds: 'labels',
    priority: 'priority',
    projectId: 'project',
    stateId: 'state',
    title: 'title',
};

/** Linear `updatedFrom` keys → Haus changed-field names for projects. */
const projectChangedKeys: Readonly<Record<string, LinearProjectChangedField>> = {
    description: 'description',
    leadId: 'lead',
    name: 'name',
    startDate: 'startDate',
    statusId: 'status',
    targetDate: 'targetDate',
};

/**
 * Changed issue fields in Haus names. Keys outside the vocabulary (`sortOrder`,
 * `updatedAt`, `subscriberIds`, ...) are dropped, so an update that only
 * reorders an issue changes nothing.
 */
export function issueChangedFields(updatedFrom: Payload | null): LinearIssueChangedField[] {
    return changedFields(updatedFrom, issueChangedKeys);
}

export function projectChangedFields(updatedFrom: Payload | null): LinearProjectChangedField[] {
    return changedFields(updatedFrom, projectChangedKeys);
}

export function numberOrNull(value: unknown, key: string): number | null {
    const raw = value !== null && typeof value === 'object' ? (value as Payload)[key] : undefined;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** `{ id, name }` from a nested object, falling back to a bare `<key>Id`. */
export function namedRef(data: Payload | null, key: string): LinearNamedRef | null {
    const nested = field(data, key);
    const id = text(nested, 'id') ?? text(data, `${key}Id`);
    return id ? { id, name: text(nested, 'name') } : null;
}

export function stateRef(data: Payload | null): LinearStateRef | null {
    const state = field(data, 'state');
    const id = text(state, 'id') ?? text(data, 'stateId');
    return id ? { id, name: text(state, 'name'), type: text(state, 'type') } : null;
}

/** Labels with names when Linear sent them, else bare ids from `labelIds`. */
export function labelRefs(data: Payload | null): LinearLabelRef[] {
    const raw = data?.labels;
    if (Array.isArray(raw)) {
        return raw.flatMap((label) => {
            const id = text(label, 'id');
            return id ? [{ id, name: text(label, 'name') }] : [];
        });
    }
    return strings(data, 'labelIds').map((id) => ({ id, name: null }));
}

/** Only `[A-Za-z0-9-]`, as the `delivery=` provenance segment requires. */
export function deliveryToken(value: string): string {
    return value.replace(/[^A-Za-z0-9-]/gu, '').slice(0, 64);
}

function changedFields<Name extends string>(
    updatedFrom: Payload | null,
    keys: Readonly<Record<string, Name>>
): Name[] {
    if (!updatedFrom) {
        return [];
    }
    const names = Object.keys(updatedFrom).flatMap((key) => {
        const name = keys[key];
        return name ? [name] : [];
    });
    return [...new Set(names)].sort();
}
