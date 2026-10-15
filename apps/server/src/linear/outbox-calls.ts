import * as z from 'zod';
import type { LinearOutboxKind } from '../postgres/schema.ts';
import { revokeLinearToken } from './linear-api.ts';
import type { LinearOutboxInput } from './outbox.ts';

const graphqlUrl = 'https://api.linear.app/graphql';
const callTimeoutMs = 10_000;

/** The Linear HTTP surface the outbox needs; tests stand in for it. */
export interface LinearOutboxTransport {
    graphql(
        accessToken: string,
        query: string,
        variables: Record<string, unknown>
    ): Promise<{ data?: unknown; errors?: { message?: string }[] }>;
    revoke(input: { clientId: string | null; token: string }): Promise<void>;
}

export interface LinearOutboxCall<Kind extends LinearOutboxKind> {
    /** Null only for `token_revoke`. */
    accessToken: string | null;
    clientId: string | null;
    /** For `label_create`: the team's `Agent` group label. */
    groupLabelId: string | null;
    input: LinearOutboxInput<Kind>;
    kind: Kind;
}

/** A Linear refusal; "already exists" never reaches here (it is success). */
export class LinearOutboxCallError extends Error {
    readonly nameCollision: boolean;
    constructor(message: string, nameCollision = false) {
        super(message);
        this.nameCollision = nameCollision;
        this.name = 'LinearOutboxCallError';
    }
}

/**
 * Runs one outbox row's Linear call. Creates send the row's client id, so a
 * retry after a lost answer meets Linear's "already exists", which counts as
 * done. Updates send absolute values, so a repeat is harmless.
 */
export async function runLinearOutboxCall(
    transport: LinearOutboxTransport,
    call: LinearOutboxCall<LinearOutboxKind>
): Promise<void> {
    if (call.kind === 'token_revoke') {
        await transport.revoke(call.input as LinearOutboxInput<'token_revoke'>);
        return;
    }
    const token = call.accessToken;
    if (!token) {
        throw new LinearOutboxCallError(`${call.kind} has no credential`);
    }
    const run = (query: string, variables: Record<string, unknown>) =>
        mutate(transport, token, query, variables);
    switch (call.kind) {
        case 'session_ack': {
            const input = call.input as LinearOutboxInput<'session_ack'>;
            await run(activityCreate, {
                input: {
                    agentSessionId: input.linearSessionId,
                    content: { body: input.body, type: 'thought' },
                    id: call.clientId,
                },
            });
            await run(sessionUpdate, {
                id: input.linearSessionId,
                input: { externalUrls: input.externalUrls },
            });
            return;
        }
        case 'session_activity': {
            const input = call.input as LinearOutboxInput<'session_activity'>;
            await run(activityCreate, {
                input: {
                    agentSessionId: input.linearSessionId,
                    content: { body: input.body, type: input.type },
                    id: call.clientId,
                },
            });
            return;
        }
        case 'session_create': {
            const input = call.input as LinearOutboxInput<'session_create'>;
            await run(sessionCreateOnIssue, {
                input: { externalUrls: input.externalUrls, issueId: input.issueId },
            });
            return;
        }
        case 'label_group_create': {
            const input = call.input as LinearOutboxInput<'label_group_create'>;
            const create = (name: string) =>
                run(labelCreate, {
                    input: { id: call.clientId, isGroup: true, name, teamId: input.teamId },
                });
            await withHausSuffix(create, input.name);
            return;
        }
        case 'label_create': {
            const input = call.input as LinearOutboxInput<'label_create'>;
            if (!call.groupLabelId) {
                throw new LinearOutboxCallError('the team has no Agent label group yet');
            }
            const create = (name: string) =>
                run(labelCreate, {
                    input: {
                        id: call.clientId,
                        name,
                        parentId: call.groupLabelId,
                        teamId: input.teamId,
                    },
                });
            await withHausSuffix(create, input.name);
            return;
        }
        case 'label_rename': {
            const input = call.input as LinearOutboxInput<'label_rename'>;
            await run(labelUpdate, { id: input.labelId, input: { name: input.name } });
            return;
        }
        case 'label_archive': {
            const input = call.input as LinearOutboxInput<'label_archive'>;
            await run(labelArchive, { id: input.labelId });
            return;
        }
        case 'issue_route': {
            const input = call.input as LinearOutboxInput<'issue_route'>;
            await run(issueUpdate, {
                id: input.issueId,
                input: {
                    ...(input.labelId ? { addedLabelIds: [input.labelId] } : {}),
                    ...(input.delegateId ? { delegateId: input.delegateId } : {}),
                    removedLabelIds: input.removeLabelIds,
                },
            });
            return;
        }
        case 'identity_hand_back': {
            const input = call.input as LinearOutboxInput<'identity_hand_back'>;
            // Absolute values: a retry re-lists and re-delegates only what is still open.
            const issueIds = await delegatedOpenIssueIds(transport, token, input.identityUserId);
            for (const issueId of issueIds) {
                await run(issueUpdate, { id: issueId, input: { delegateId: input.delegateId } });
            }
            return;
        }
        default:
            throw new LinearOutboxCallError(`unknown outbox kind ${call.kind}`);
    }
}

/**
 * A name a label Haus did not create already holds gets " (Haus)"; Haus never
 * adopts or edits that other label.
 */
async function withHausSuffix(create: (name: string) => Promise<void>, name: string) {
    try {
        await create(name);
    } catch (error) {
        if (!(error instanceof LinearOutboxCallError && error.nameCollision)) {
            throw error;
        }
        await create(`${name} (Haus)`);
    }
}

/** Linear over `fetch`, with a per-call timeout. */
export function linearHttpOutboxTransport(
    appClientId: string | null,
    fetchImpl: typeof fetch = fetch
): LinearOutboxTransport {
    return {
        graphql: async (accessToken, query, variables) => {
            const response = await fetchImpl(graphqlUrl, {
                body: JSON.stringify({ query, variables }),
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal: AbortSignal.timeout(callTimeoutMs),
            });
            if (response.status === 401 || response.status >= 500) {
                throw new LinearOutboxCallError(`Linear answered ${response.status}`);
            }
            return (await response.json()) as { data?: unknown; errors?: { message?: string }[] };
        },
        revoke: async (input) => {
            const clientId = input.clientId ?? appClientId;
            if (!clientId) {
                throw new LinearOutboxCallError('the Haus Linear app is not configured');
            }
            await revokeLinearToken(fetchImpl, { clientId, token: input.token });
        },
    };
}

async function mutate(
    transport: LinearOutboxTransport,
    token: string,
    query: string,
    variables: Record<string, unknown>
): Promise<void> {
    const answer = await transport.graphql(token, query, variables);
    const errors = answer.errors ?? [];
    if (errors.length === 0) {
        return;
    }
    const messages = errors.map((error) => error.message ?? 'error');
    // A client id Linear already holds means an earlier attempt landed.
    if (messages.every((message) => /with id .* already exists/iu.test(message))) {
        return;
    }
    const joined = messages.join('; ');
    throw new LinearOutboxCallError(joined, isNameCollision(joined));
}

/** Open issues (not completed or canceled) delegated to one Linear user. */
async function delegatedOpenIssueIds(
    transport: LinearOutboxTransport,
    token: string,
    delegateId: string
): Promise<string[]> {
    const answer = await transport.graphql(token, delegatedIssuesQuery, { delegate: delegateId });
    if ((answer.errors ?? []).length > 0) {
        const messages = (answer.errors ?? []).map((error) => error.message ?? 'error');
        throw new LinearOutboxCallError(messages.join('; '));
    }
    const parsed = delegatedIssuesSchema.safeParse(answer.data);
    if (!parsed.success) {
        throw new LinearOutboxCallError('Linear answered delegated issues in an unknown shape');
    }
    return parsed.data.issues.nodes.map((node) => node.id);
}

/** Linear refusing a label name another label in the team already has. */
function isNameCollision(message: string): boolean {
    return /name/iu.test(message) && /(already exists|taken|duplicate|in use)/iu.test(message);
}

const activityCreate = `mutation HausActivity($input: AgentActivityCreateInput!) {
  agentActivityCreate(input: $input) { success }
}`;
const sessionUpdate = `mutation HausSessionUrls($id: String!, $input: AgentSessionUpdateInput!) {
  agentSessionUpdate(id: $id, input: $input) { success }
}`;
const sessionCreateOnIssue = `mutation HausSessionCreate($input: AgentSessionCreateOnIssue!) {
  agentSessionCreateOnIssue(input: $input) { success }
}`;
const labelCreate = `mutation HausLabelCreate($input: IssueLabelCreateInput!) {
  issueLabelCreate(input: $input) { success }
}`;
const labelUpdate = `mutation HausLabelRename($id: String!, $input: IssueLabelUpdateInput!) {
  issueLabelUpdate(id: $id, input: $input) { success }
}`;
const labelArchive = `mutation HausLabelArchive($id: String!) {
  issueLabelArchive(id: $id) { success }
}`;
const issueUpdate = `mutation HausIssueRoute($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;
const delegatedIssuesQuery = `query HausDelegatedIssues($delegate: ID!) {
  issues(first: 250, filter: {
    delegate: { id: { eq: $delegate } },
    state: { type: { nin: ["completed", "canceled"] } }
  }) { nodes { id } }
}`;
const delegatedIssuesSchema = z.object({
    issues: z.object({ nodes: z.array(z.object({ id: z.string().min(1) })) }),
});
