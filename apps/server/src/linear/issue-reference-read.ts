import * as z from 'zod';
import { LinearApiError, linearGraphql } from './linear-api.ts';
import { isLinearAssetUrl } from './thumbnail-token.ts';

// The GraphQL reads behind an issue chip (specs/linear-app.md#issue-references-in-chat):
// one issue by its key, and the organization's current url key.

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
const issueSchema = z.object({
    assignee: z.object({ id: z.string().min(1), name: z.string() }).nullable(),
    description: z.string().nullable(),
    id: z.string().min(1),
    identifier: z.string().min(1),
    labels: z.object({
        nodes: z.array(z.object({ color: colorSchema, id: z.string().min(1), name: z.string() })),
    }),
    state: z.object({ color: colorSchema, id: z.string().min(1), name: z.string() }),
    title: z.string(),
    url: z.url(),
});

/** One issue as Linear reports it, before Haus adds the Agent and the ledger. */
export interface LinearIssueRecord {
    assignee: { id: string; name: string } | null;
    id: string;
    identifier: string;
    labels: { color: string; id: string; name: string }[];
    state: { color: string; id: string; name: string };
    /** The first image Linear hosts in the description, if any. */
    thumbnailAssetUrl: string | null;
    title: string;
    url: string;
}

const issueQuery = `query HausIssueChip($id: String!) {
    issue(id: $id) {
        id identifier title url description
        state { id name color }
        assignee { id name }
        labels(first: 20) { nodes { id name color } }
    }
}`;

/** One issue by key; null when Linear has no such issue the token can see. */
export async function readLinearIssue(
    transport: typeof fetch,
    token: string,
    identifier: string
): Promise<LinearIssueRecord | null> {
    let result: { issue: z.infer<typeof issueSchema> | null };
    try {
        result = await linearGraphql(
            transport,
            token,
            { query: issueQuery, variables: { id: identifier } },
            z.object({ issue: issueSchema.nullable() })
        );
    } catch (error) {
        // Linear answers an unknown or unreachable issue as an input error.
        if (error instanceof LinearApiError && error.failure === 'input') {
            return null;
        }
        throw error;
    }
    const { issue } = result;
    if (!issue) {
        return null;
    }
    return {
        assignee: issue.assignee ? { id: issue.assignee.id, name: issue.assignee.name } : null,
        id: issue.id,
        identifier: issue.identifier,
        labels: issue.labels.nodes,
        state: issue.state,
        thumbnailAssetUrl: firstLinearImage(issue.description),
        title: issue.title,
        url: issue.url,
    };
}

/** The organization's url key as Linear reports it now. */
export async function readLinearOrganizationUrlKey(
    transport: typeof fetch,
    token: string
): Promise<string> {
    const result = await linearGraphql(
        transport,
        token,
        { query: 'query HausOrganizationKey { organization { urlKey } }' },
        z.object({ organization: z.object({ urlKey: z.string().min(1) }) })
    );
    return result.organization.urlKey;
}

const markdownImagePattern = /!\[[^\]]*\]\((https:\/\/uploads\.linear\.app\/[^\s)]+)\)/u;

/** Only Linear-hosted uploads qualify: the thumbnail route fetches nothing else. */
export function firstLinearImage(description: string | null): string | null {
    const match = description ? markdownImagePattern.exec(description) : null;
    const url = match?.[1];
    return url && isLinearAssetUrl(url) ? url : null;
}
