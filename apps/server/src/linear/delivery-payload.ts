// Readers over staged Linear webhook bodies, checked against real deliveries in
// apps/server/test/fixtures/linear/captured/.

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
        state: string | null;
        teamId: string | null;
        title: string | null;
        url: string | null;
    };
    /**
     * Label names Linear lists for the issue in `promptContext`
     * (`<label>Agent › Juniper</label>`). Session events carry no label ids.
     */
    issueLabelNames: string[];
    linearSessionId: string;
    /**
     * A comment mention (`sourceMetadata.type: "comment"`); otherwise a delegation or
     * proactive session, whose `comment` is only Linear's placeholder thread.
     */
    mentioned: boolean;
    /** The person's words: the mention comment, or a follow-up's body; never the placeholder. */
    prompt: string | null;
    promptContext: string | null;
    /** `stop` when a person stopped the session (Q9); null for a plain prompt. */
    signal: string | null;
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
    const mentioned = text(field(session, 'sourceMetadata'), 'type') === 'comment';
    const activity = field(body, 'agentActivity');
    const activityBody = text(activity, 'body') ?? text(field(activity, 'content'), 'body');
    const promptContext = text(body, 'promptContext');
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
            state: text(field(issue, 'state'), 'name'),
            teamId: text(issue, 'teamId') ?? text(field(issue, 'team'), 'id'),
            title: text(issue, 'title'),
            url: text(issue, 'url'),
        },
        issueLabelNames: promptContext ? promptContextLabels(promptContext) : [],
        linearSessionId,
        mentioned,
        prompt:
            action === 'prompted'
                ? activityBody
                : mentioned
                  ? text(field(session, 'comment'), 'body')
                  : null,
        promptContext,
        signal: text(activity, 'signal'),
    };
}

/** The `<label>` names inside `promptContext`'s `<issue>` element. */
function promptContextLabels(promptContext: string): string[] {
    const issue = /<issue\b[^>]*>([\s\S]*?)<\/issue>/u.exec(promptContext)?.[1] ?? '';
    return [...issue.matchAll(/<label>([^<]*)<\/label>/gu)].flatMap((match) => {
        const name = decodeXml(match[1] ?? '').trim();
        return name ? [name] : [];
    });
}

function decodeXml(value: string): string {
    return value
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&');
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
