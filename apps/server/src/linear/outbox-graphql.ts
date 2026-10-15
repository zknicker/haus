import * as z from 'zod';
import type { LinearOutboxTransport } from './outbox-calls.ts';

// The GraphQL the outbox sends, and how it reads Linear's answers: a mutation
// lands only when it reports no errors and no `success: false`.

/** A Linear refusal; "already exists" never reaches here (it is success). */
export class LinearOutboxCallError extends Error {
    readonly nameCollision: boolean;
    constructor(message: string, nameCollision = false) {
        super(message);
        this.nameCollision = nameCollision;
        this.name = 'LinearOutboxCallError';
    }
}

/** Delegated issues read per page, and the most pages one hand-back reads. */
const issuePageSize = 100;
const issuePageLimit = 50;

/**
 * Runs one mutation. A client id Linear already holds means an earlier
 * attempt landed. `success: false` is a failure the row retries.
 */
export async function mutate(
    transport: LinearOutboxTransport,
    token: string,
    query: string,
    variables: Record<string, unknown>
): Promise<void> {
    const answer = await transport.graphql(token, query, variables);
    const errors = answer.errors ?? [];
    if (errors.length > 0) {
        const messages = errors.map((error) => error.message ?? 'error');
        if (messages.every((message) => /with id .* already exists/iu.test(message))) {
            return;
        }
        const joined = messages.join('; ');
        throw new LinearOutboxCallError(joined, isNameCollision(joined));
    }
    const refused = Object.entries(
        (answer.data ?? {}) as Record<string, { success?: unknown } | null>
    ).find(([, result]) => result?.success === false);
    if (refused) {
        throw new LinearOutboxCallError(`Linear answered ${refused[0]} with success: false`);
    }
}

/**
 * Open issues (not completed or canceled) delegated to one Linear user, every
 * page of them. More than the page limit throws rather than handing back a part.
 */
export async function delegatedOpenIssueIds(
    transport: LinearOutboxTransport,
    token: string,
    delegateId: string
): Promise<string[]> {
    const ids: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < issuePageLimit; page += 1) {
        const answer = await transport.graphql(token, delegatedIssuesQuery, {
            after,
            delegate: delegateId,
            first: issuePageSize,
        });
        if ((answer.errors ?? []).length > 0) {
            const messages = (answer.errors ?? []).map((error) => error.message ?? 'error');
            throw new LinearOutboxCallError(messages.join('; '));
        }
        const parsed = delegatedIssuesSchema.safeParse(answer.data);
        if (!parsed.success) {
            throw new LinearOutboxCallError('Linear answered delegated issues in an unknown shape');
        }
        const { nodes, pageInfo } = parsed.data.issues;
        ids.push(...nodes.map((node) => node.id));
        if (!(pageInfo.hasNextPage && pageInfo.endCursor)) {
            return ids;
        }
        after = pageInfo.endCursor;
    }
    throw new LinearOutboxCallError(
        `more than ${issuePageSize * issuePageLimit} open issues are delegated to ${delegateId}`
    );
}

/** Linear refusing a label name another label in the team already has. */
function isNameCollision(message: string): boolean {
    return /name/iu.test(message) && /(already exists|taken|duplicate|in use)/iu.test(message);
}

export const activityCreate = `mutation HausActivity($input: AgentActivityCreateInput!) {
  agentActivityCreate(input: $input) { success }
}`;
export const sessionUpdate = `mutation HausSessionUrls($id: String!, $input: AgentSessionUpdateInput!) {
  agentSessionUpdate(id: $id, input: $input) { success }
}`;
export const sessionCreateOnIssue = `mutation HausSessionCreate($input: AgentSessionCreateOnIssue!) {
  agentSessionCreateOnIssue(input: $input) { success }
}`;
export const labelCreate = `mutation HausLabelCreate($input: IssueLabelCreateInput!) {
  issueLabelCreate(input: $input) { success }
}`;
export const labelUpdate = `mutation HausLabelRename($id: String!, $input: IssueLabelUpdateInput!) {
  issueLabelUpdate(id: $id, input: $input) { success }
}`;
export const labelArchive = `mutation HausLabelArchive($id: String!) {
  issueLabelArchive(id: $id) { success }
}`;
export const issueUpdate = `mutation HausIssueRoute($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;
const delegatedIssuesQuery = `query HausDelegatedIssues($delegate: ID!, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: {
    delegate: { id: { eq: $delegate } },
    state: { type: { nin: ["completed", "canceled"] } }
  }) { nodes { id } pageInfo { hasNextPage endCursor } }
}`;
const delegatedIssuesSchema = z.object({
    issues: z.object({
        nodes: z.array(z.object({ id: z.string().min(1) })),
        pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }),
    }),
});
