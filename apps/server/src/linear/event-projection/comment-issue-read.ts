import * as z from 'zod';
import { linearGraphql } from '../linear-api.ts';
import type { LinearCommentIssueRead } from './project.ts';

// The issue read a comment delivery needs before matching: captured Comment
// bodies carry only the issue's id, title, team, identifier, and url, while
// `comment` groups filter on its labels, project, delegate, and assignee.

const refSchema = z.object({ id: z.string().min(1), name: z.string().nullable().optional() });
const issueSchema = z.object({
    assignee: refSchema.nullable(),
    delegate: z
        .object({ id: z.string().min(1) })
        .nullable()
        .optional(),
    id: z.string().min(1),
    identifier: z.string().min(1),
    labels: z.object({ nodes: z.array(refSchema) }),
    project: refSchema.nullable(),
    state: refSchema.extend({ type: z.string().nullable().optional() }).nullable(),
    team: z.object({ id: z.string().min(1), key: z.string().min(1) }).nullable(),
    title: z.string(),
    url: z.string(),
});

const issueQuery = `query HausTriggerCommentIssue($id: String!) {
    issue(id: $id) {
        id identifier title url
        team { id key }
        state { id name type }
        project { id name }
        assignee { id name }
        delegate { id }
        labels(first: 50) { nodes { id name } }
    }
}`;

/**
 * Reads one issue with the workspace token. A failure throws, so the delivery
 * retries rather than matching on facts it does not have.
 */
export async function readCommentIssue(
    transport: typeof fetch,
    token: string,
    issueId: string
): Promise<LinearCommentIssueRead> {
    const { issue } = await linearGraphql(
        transport,
        token,
        { query: issueQuery, variables: { id: issueId } },
        z.object({ issue: issueSchema })
    );
    return {
        assignee: issue.assignee
            ? { id: issue.assignee.id, name: issue.assignee.name ?? null }
            : null,
        delegateId: issue.delegate?.id ?? null,
        id: issue.id,
        identifier: issue.identifier,
        labels: issue.labels.nodes.map((label) => ({ id: label.id, name: label.name ?? null })),
        project: issue.project ? { id: issue.project.id, name: issue.project.name ?? null } : null,
        state: issue.state
            ? { id: issue.state.id, name: issue.state.name ?? null, type: issue.state.type ?? null }
            : null,
        team: issue.team,
        title: issue.title,
        url: issue.url,
    };
}
