// Readers over staged Linear webhook bodies. Shapes follow Linear's documented
// payloads (https://linear.app/developers/webhooks, /agent-interaction) and are
// provisional until real deliveries are captured (apps/server/test/fixtures/linear/).

export type Payload = Record<string, unknown>;

export function field(value: unknown, key: string): Payload | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const next = (value as Payload)[key];
    return next !== null && typeof next === 'object' && !Array.isArray(next)
        ? (next as Payload)
        : null;
}

export function text(value: unknown, key?: string): string | null {
    const raw =
        key === undefined
            ? value
            : value !== null && typeof value === 'object'
              ? (value as Payload)[key]
              : undefined;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function strings(value: unknown, key: string): string[] {
    const raw = value !== null && typeof value === 'object' ? (value as Payload)[key] : undefined;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

export interface LinearSessionEventFacts {
    action: string;
    appUserId: string | null;
    /** Who started the session (`created`) or sent the prompt (`prompted`). */
    causedBy: string | null;
    guidance: string | null;
    issue: {
        delegateId: string | null;
        id: string;
        identifier: string;
        labelIds: string[];
        state: string | null;
        teamId: string | null;
        title: string | null;
        url: string | null;
    };
    linearSessionId: string;
    /** A session started from a comment is a mention; otherwise a delegation. */
    mentioned: boolean;
    prompt: string | null;
    promptContext: string | null;
}

/** The facts session routing needs from an `AgentSessionEvent`, or null when malformed. */
export function readSessionEvent(body: Payload): LinearSessionEventFacts | null {
    const session = field(body, 'agentSession');
    const issue = field(session, 'issue');
    const linearSessionId = text(session, 'id');
    const issueId = text(issue, 'id') ?? text(session, 'issueId');
    const action = text(body, 'action');
    if (!(session && linearSessionId && issueId && action)) {
        return null;
    }
    const comment = field(session, 'comment');
    const activity = field(body, 'agentActivity');
    const activityBody = text(activity, 'body') ?? text(field(activity, 'content'), 'body');
    return {
        action,
        appUserId: text(body, 'appUserId'),
        causedBy:
            action === 'prompted'
                ? (text(activity, 'userId') ?? text(field(activity, 'user'), 'id'))
                : (text(session, 'creatorId') ?? text(field(session, 'creator'), 'id')),
        guidance: guidanceText(body.guidance),
        issue: {
            delegateId: text(issue, 'delegateId') ?? text(field(issue, 'delegate'), 'id'),
            id: issueId,
            identifier: text(issue, 'identifier') ?? issueId,
            labelIds: strings(issue, 'labelIds'),
            state: text(field(issue, 'state'), 'name'),
            teamId: text(issue, 'teamId') ?? text(field(issue, 'team'), 'id'),
            title: text(issue, 'title'),
            url: text(issue, 'url'),
        },
        linearSessionId,
        mentioned: comment !== null,
        prompt: action === 'prompted' ? activityBody : text(comment, 'body'),
        promptContext: text(body, 'promptContext'),
    };
}

/** Linear sends guidance as text or as a list of `{ body }` rules. */
function guidanceText(value: unknown): string | null {
    if (typeof value === 'string') {
        return value || null;
    }
    if (!Array.isArray(value)) {
        return null;
    }
    const bodies = value.flatMap((rule) => {
        const body = text(rule, 'body');
        return body ? [body] : [];
    });
    return bodies.length > 0 ? bodies.join('\n\n') : null;
}

/** The changed entity of a data delivery (`Issue`, `Comment`, ...) and who changed it. */
export function readDataChange(body: Payload): {
    actorId: string | null;
    data: Payload;
    entityId: string;
    updatedAt: Date | null;
    updatedFrom: Payload | null;
} | null {
    const data = field(body, 'data');
    const entityId = text(data, 'id');
    if (!(data && entityId)) {
        return null;
    }
    const updatedAt = text(data, 'updatedAt');
    const parsed = updatedAt ? new Date(updatedAt) : null;
    return {
        actorId: text(field(body, 'actor'), 'id'),
        data,
        entityId,
        updatedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
        updatedFrom: field(body, 'updatedFrom'),
    };
}
