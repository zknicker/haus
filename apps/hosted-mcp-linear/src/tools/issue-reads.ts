import * as z from 'zod';
import type { LinearGraphql } from '../linear-graphql.ts';
import {
    cursorArg,
    defineTool,
    flatten,
    idOr,
    issueArg,
    type LinearConnection,
    limitArg,
    linearIdArg,
    page,
    pageInfoFields,
    queryArg,
} from '../tool.ts';
import { inputError } from '../tool-error.ts';
import { commentFields } from './comment-create.ts';

export const issueSummaryFields = `id identifier title url priority updatedAt
    state { id name type } team { id key name }
    assignee { id displayName } delegate { id displayName }
    labels { nodes { id name } } project { id name }`;

export const issueDetailFields = `${issueSummaryFields} description estimate dueDate createdAt
    cycle { id number name } parent { id identifier title }`;

const searchIssuesInput = z
    .object({
        assignee: linearIdArg.optional().describe('User id or display name.'),
        cursor: cursorArg,
        includeArchived: z.boolean().default(false),
        label: linearIdArg.optional().describe('Label id or name, such as an Agent label.'),
        limit: limitArg,
        project: linearIdArg.optional().describe('Project id or name.'),
        query: queryArg.optional().describe('Full-text search terms.'),
        state: linearIdArg.optional().describe('Workflow state id or name.'),
        stateType: z
            .enum(['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'])
            .optional(),
        team: linearIdArg.optional().describe('Team id or key.'),
    })
    .strict();

export const searchIssues = defineTool({
    name: 'search_issues',
    description:
        'Find Linear issues by text and filters (team, state, label, project, assignee). Newest updates first.',
    input: searchIssuesInput,
    readOnly: true,
    async run(context, input) {
        const filter = issueFilter(input);
        const variables = {
            after: input.cursor,
            filter,
            first: input.limit,
            includeArchived: input.includeArchived,
            ...(input.query ? { term: input.query } : {}),
        };
        if (input.query) {
            const data = await context.linear.request<{
                searchIssues: LinearConnection<unknown>;
            }>(
                `query SearchIssues($term: String!, $filter: IssueFilter, $first: Int, $after: String, $includeArchived: Boolean) {
                    searchIssues(term: $term, filter: $filter, first: $first, after: $after, includeArchived: $includeArchived) {
                        nodes { ${issueSummaryFields} } ${pageInfoFields}
                    }
                }`,
                variables
            );
            return page(data.searchIssues);
        }
        const data = await context.linear.request<{ issues: LinearConnection<unknown> }>(
            `query Issues($filter: IssueFilter, $first: Int, $after: String, $includeArchived: Boolean) {
                issues(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived, orderBy: updatedAt) {
                    nodes { ${issueSummaryFields} } ${pageInfoFields}
                }
            }`,
            variables
        );
        return page(data.issues);
    },
});

export const getIssue = defineTool({
    name: 'get_issue',
    description: 'Read one Linear issue with its description, state, labels, and delegate.',
    input: z.object({ issue: issueArg }).strict(),
    readOnly: true,
    async run(context, input) {
        return { issue: flatten(await readIssue(context.linear, input.issue)) };
    },
});

export const listComments = defineTool({
    name: 'list_comments',
    description: "List an issue's comments, oldest first.",
    input: z.object({ cursor: cursorArg, issue: issueArg, limit: limitArg }).strict(),
    readOnly: true,
    async run(context, input) {
        const data = await context.linear.request<{
            issue: { comments: LinearConnection<unknown> } | null;
        }>(
            `query IssueComments($id: String!, $first: Int, $after: String) {
                issue(id: $id) {
                    comments(first: $first, after: $after, orderBy: createdAt) {
                        nodes { ${commentFields} } ${pageInfoFields}
                    }
                }
            }`,
            { after: input.cursor, first: input.limit, id: input.issue }
        );
        if (!data.issue) {
            throw inputError('Issue not found.');
        }
        return page(data.issue.comments);
    },
});

export async function readIssue(linear: LinearGraphql, issue: string) {
    const data = await linear.request<{ issue: Record<string, unknown> | null }>(
        `query Issue($id: String!) { issue(id: $id) { ${issueDetailFields} } }`,
        { id: issue }
    );
    if (!data.issue) {
        throw inputError('Issue not found.');
    }
    return data.issue;
}

function issueFilter(input: z.output<typeof searchIssuesInput>) {
    const filter: Record<string, unknown> = {};
    if (input.team) {
        filter.team = idOr('key', input.team);
    }
    if (input.state) {
        filter.state = idOr('name', input.state);
    }
    if (input.stateType) {
        filter.state = { ...(filter.state as object | undefined), type: { eq: input.stateType } };
    }
    if (input.label) {
        filter.labels = { some: idOr('name', input.label) };
    }
    if (input.project) {
        filter.project = idOr('name', input.project);
    }
    if (input.assignee) {
        filter.assignee = idOr('displayName', input.assignee);
    }
    return filter;
}
