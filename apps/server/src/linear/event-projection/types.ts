import type {
    LinearIssueChangedField,
    LinearProjectChangedField,
    LinearTriggerEventName,
} from '@haus/api';

// The projection a `linear` fire stores and the matcher reads
// (specs/linear-triggers.md#projection). Every Linear reference is a stable
// id; names ride along only for the Agent to read. A missing or mistyped
// payload field projects to null.

export interface LinearNamedRef {
    id: string | null;
    name: string | null;
}

export interface LinearStateRef extends LinearNamedRef {
    type: string | null;
}

export interface LinearLabelRef {
    id: string;
    name: string | null;
}

/** The delegate as Linear names it and as Haus's `Agent` label marks it. */
export interface LinearDelegateRef {
    /** The Haus Agent whose `Agent` label the issue carries, if any. */
    agentId: string | null;
    linearUserId: string | null;
}

/** What every `linear` projection carries. */
export interface LinearProjectionCommon {
    action: string;
    actor: { id: string | null; name: string | null; type: string | null };
    createdAt: string | null;
    event: LinearTriggerEventName;
    haus: {
        /** The Agent that caused the delivery (specs/linear-app.md#loop-safety), or null. */
        agentActor: string | null;
        /** Marks a sample projection sent by `trigger.test`. */
        test?: true;
    };
    organization: { id: string | null; urlKey: string | null };
    team: { id: string | null; key: string | null };
    url: string | null;
}

/** The issue facts an `issue` or `comment` group filters on. */
export interface LinearIssueFacts {
    assignee: LinearNamedRef | null;
    delegate: LinearDelegateRef;
    id: string;
    identifier: string | null;
    labels: LinearLabelRef[];
    project: LinearNamedRef | null;
    state: LinearStateRef | null;
    title: string | null;
    url: string | null;
}

export interface LinearIssueProjection extends LinearProjectionCommon {
    event: 'issue';
    issue: LinearIssueFacts & {
        changed: LinearIssueChangedField[];
        description: string | null;
        /** Label ids before the change; null when labels did not change. */
        previousLabelIds: string[] | null;
        /** The state before the change; null when the state did not change. */
        previousState: LinearStateRef | null;
        priority: number | null;
    };
}

export interface LinearCommentProjection extends LinearProjectionCommon {
    comment: {
        body: string | null;
        id: string;
        issue: LinearIssueFacts & { team: { id: string | null; key: string | null } };
        parentId: string | null;
    };
    event: 'comment';
}

export interface LinearProjectProjection extends LinearProjectionCommon {
    event: 'project';
    project: {
        changed: LinearProjectChangedField[];
        description: string | null;
        id: string;
        lead: LinearNamedRef | null;
        name: string | null;
        status: LinearNamedRef | null;
        teamIds: string[];
        url: string | null;
    };
}

export type LinearProjection =
    | LinearCommentProjection
    | LinearIssueProjection
    | LinearProjectProjection;
