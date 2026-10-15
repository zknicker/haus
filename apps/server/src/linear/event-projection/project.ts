import type { LinearTriggerEventName } from '@haus/api';
import { clip, serializeProjection } from '../../github/event-projection/text-limits.ts';
import { field, type Payload, strings, text } from '../delivery-payload.ts';
import {
    issueChangedFields,
    labelRefs,
    namedRef,
    numberOrNull,
    projectChangedFields,
    stateRef,
} from './fields.ts';
import type {
    LinearCommentProjection,
    LinearIssueFacts,
    LinearIssueProjection,
    LinearProjection,
    LinearProjectionCommon,
    LinearProjectProjection,
} from './types.ts';

const issueDescriptionMax = 4000;
const commentBodyMax = 4000;
const projectDescriptionMax = 2000;

/** Linear's webhook `type` (the `Linear-Event` header) → the Trigger event it is. */
const deliveryEvents: Readonly<Record<string, LinearTriggerEventName>> = {
    Comment: 'comment',
    Issue: 'issue',
    Project: 'project',
};

/**
 * A comment's issue as the worker reads it from Linear when the Comment body
 * lacks the facts a filter needs (captured Comment bodies carry only id,
 * title, team, identifier, and url).
 */
export interface LinearCommentIssueRead {
    assignee: { id: string; name: string | null } | null;
    delegateId: string | null;
    id: string;
    identifier: string | null;
    labels: { id: string; name: string | null }[];
    project: { id: string; name: string | null } | null;
    state: { id: string; name: string | null; type: string | null } | null;
    team: { id: string; key: string | null } | null;
    title: string | null;
    url: string | null;
}

export interface LinearProjectionInput {
    agentActor: string | null;
    body: Payload;
    /** The issue read for a comment; null when no read was needed or made. */
    commentIssue: LinearCommentIssueRead | null;
    /** The Agent whose `Agent` label the subject issue carries. */
    delegateAgentId: string | null;
    event: LinearTriggerEventName;
    organization: { id: string | null; urlKey: string | null };
    test?: boolean;
}

/** The Trigger event a delivery is, or null for events Triggers never see. */
export function linearTriggerEvent(deliveryEvent: string): LinearTriggerEventName | null {
    return deliveryEvents[deliveryEvent] ?? null;
}

/** The label ids the subject issue carries, before any Agent lookup. */
export function linearSubjectLabelIds(
    event: LinearTriggerEventName,
    body: Payload,
    commentIssue: LinearCommentIssueRead | null
): string[] {
    if (event === 'issue') {
        return labelRefs(field(body, 'data')).map((label) => label.id);
    }
    return event === 'comment' ? (commentIssue?.labels.map((label) => label.id) ?? []) : [];
}

/** The id of the entity the delivery is about, for ledger correlation. */
export function linearEntityId(body: Payload): string | null {
    return text(field(body, 'data'), 'id');
}

/**
 * One delivery's projection (specs/linear-triggers.md#projection): built once
 * at match time, read by the matcher, and stored as every fire's payload.
 * Null when the body is not a readable entity of its event.
 */
export function projectLinearDelivery(input: LinearProjectionInput): LinearProjection | null {
    const data = field(input.body, 'data');
    const id = text(data, 'id');
    if (!(data && id)) {
        return null;
    }
    switch (input.event) {
        case 'issue':
            return projectIssue(input, data, id);
        case 'comment':
            return projectComment(input, data, id);
        case 'project':
            return projectProject(input, data, id);
        default:
            return null;
    }
}

/** Two-space JSON within the stored payload ceiling; the longest strings halve first. */
export function serializeLinearProjection(projection: LinearProjection): string {
    return serializeProjection(projection);
}

function common(
    input: LinearProjectionInput,
    team: { id: string | null; key: string | null }
): Omit<LinearProjectionCommon, 'event'> {
    const actor = field(input.body, 'actor');
    return {
        action: text(input.body, 'action') ?? 'unknown',
        actor: { id: text(actor, 'id'), name: text(actor, 'name'), type: text(actor, 'type') },
        createdAt: text(input.body, 'createdAt'),
        haus: { agentActor: input.agentActor, ...(input.test ? { test: true as const } : {}) },
        organization: input.organization,
        team,
        url: text(input.body, 'url'),
    };
}

function issueTeam(data: Payload) {
    const team = field(data, 'team');
    return { id: text(team, 'id') ?? text(data, 'teamId'), key: text(team, 'key') };
}

function projectIssue(input: LinearProjectionInput, data: Payload, id: string) {
    const updatedFrom = field(input.body, 'updatedFrom');
    const stateChanged = updatedFrom !== null && 'stateId' in updatedFrom;
    const previousStateId = stateChanged ? text(updatedFrom, 'stateId') : null;
    const projection: LinearIssueProjection = {
        ...common(input, issueTeam(data)),
        event: 'issue',
        issue: {
            ...issueFacts(data, id, input.delegateAgentId),
            changed: issueChangedFields(updatedFrom),
            description: clipped(text(data, 'description'), issueDescriptionMax),
            previousLabelIds:
                updatedFrom !== null && 'labelIds' in updatedFrom
                    ? strings(updatedFrom, 'labelIds')
                    : null,
            previousState: previousStateId ? { id: previousStateId, name: null, type: null } : null,
            priority: numberOrNull(data, 'priority'),
        },
    };
    return projection;
}

function issueFacts(data: Payload, id: string, delegateAgentId: string | null): LinearIssueFacts {
    return {
        assignee: namedRef(data, 'assignee'),
        delegate: {
            agentId: delegateAgentId,
            linearUserId: text(data, 'delegateId') ?? text(field(data, 'delegate'), 'id'),
        },
        id,
        identifier: text(data, 'identifier'),
        labels: labelRefs(data),
        project: namedRef(data, 'project'),
        state: stateRef(data),
        title: text(data, 'title'),
        url: text(data, 'url'),
    };
}

function projectComment(input: LinearProjectionInput, data: Payload, id: string) {
    const bodyIssue = field(data, 'issue');
    const read = input.commentIssue;
    const issueId = read?.id ?? text(bodyIssue, 'id') ?? text(data, 'issueId');
    if (!issueId) {
        return null;
    }
    const bodyTeam = bodyIssue ? issueTeam(bodyIssue) : { id: null, key: null };
    const team = { id: read?.team?.id ?? bodyTeam.id, key: read?.team?.key ?? bodyTeam.key };
    const projection: LinearCommentProjection = {
        ...common(input, team),
        comment: {
            body: clipped(text(data, 'body'), commentBodyMax),
            id,
            issue: {
                assignee: read?.assignee ?? null,
                delegate: {
                    agentId: input.delegateAgentId,
                    linearUserId: read?.delegateId ?? null,
                },
                id: issueId,
                identifier: read?.identifier ?? text(bodyIssue, 'identifier'),
                labels: read?.labels ?? [],
                project: read?.project ?? null,
                state: read?.state ?? null,
                team,
                title: read?.title ?? text(bodyIssue, 'title'),
                url: read?.url ?? text(bodyIssue, 'url'),
            },
            parentId: text(data, 'parentId'),
        },
        event: 'comment',
    };
    return projection;
}

function projectProject(input: LinearProjectionInput, data: Payload, id: string) {
    const teamIds = strings(data, 'teamIds');
    const projection: LinearProjectProjection = {
        ...common(input, { id: teamIds[0] ?? null, key: null }),
        event: 'project',
        project: {
            changed: projectChangedFields(field(input.body, 'updatedFrom')),
            description: clipped(text(data, 'description'), projectDescriptionMax),
            id,
            lead: namedRef(data, 'lead'),
            name: text(data, 'name'),
            status: namedRef(data, 'status'),
            teamIds,
            url: text(data, 'url'),
        },
    };
    return projection;
}

function clipped(value: string | null, max: number): string | null {
    return value === null ? null : clip(value, max);
}
