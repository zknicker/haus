import * as z from 'zod';
import {
    cursorArg,
    defineTool,
    flatten,
    idOr,
    type LinearConnection,
    limitArg,
    linearIdArg,
    page,
    pageInfoFields,
    queryArg,
    teamArg,
} from '../tool.ts';
import { inputError } from '../tool-error.ts';

export const workflowStateFields = 'id name type color position description team { id key }';

const pageArgs = { cursor: cursorArg, limit: limitArg };

export const listTeams = defineTool({
    name: 'list_teams',
    description: 'List the Linear teams Haus can reach in this workspace.',
    input: z.object(pageArgs).strict(),
    readOnly: true,
    async run(context, input) {
        const data = await context.linear.request<{ teams: LinearConnection<unknown> }>(
            `query Teams($first: Int, $after: String) {
                teams(first: $first, after: $after) { nodes { id key name description } ${pageInfoFields} }
            }`,
            { after: input.cursor, first: input.limit }
        );
        return page(data.teams);
    },
});

export const listProjects = defineTool({
    name: 'list_projects',
    description: 'List Linear projects, optionally by team or name.',
    input: z.object({ ...pageArgs, query: queryArg.optional(), team: teamArg.optional() }).strict(),
    readOnly: true,
    async run(context, input) {
        const filter: Record<string, unknown> = {};
        if (input.query) {
            filter.name = { containsIgnoreCase: input.query };
        }
        if (input.team) {
            filter.accessibleTeams = { some: idOr('key', input.team) };
        }
        const data = await context.linear.request<{ projects: LinearConnection<unknown> }>(
            `query Projects($filter: ProjectFilter, $first: Int, $after: String) {
                projects(filter: $filter, first: $first, after: $after) {
                    nodes { id name url status { name type } teams { nodes { id key } } targetDate updatedAt }
                    ${pageInfoFields}
                }
            }`,
            { after: input.cursor, filter, first: input.limit }
        );
        return page(data.projects);
    },
});

export const getProject = defineTool({
    name: 'get_project',
    description: 'Read one Linear project with its description, status, and teams.',
    input: z.object({ project: linearIdArg }).strict(),
    readOnly: true,
    async run(context, input) {
        const data = await context.linear.request<{ project: unknown }>(
            `query Project($id: String!) {
                project(id: $id) {
                    id name description content url status { name type } lead { id displayName }
                    teams { nodes { id key name } } startDate targetDate progress updatedAt
                }
            }`,
            { id: input.project }
        );
        if (!data.project) {
            throw inputError('Project not found.');
        }
        return { project: flatten(data.project) };
    },
});

export const listLabels = defineTool({
    name: 'list_labels',
    description:
        'List issue labels, optionally by team or name. Agent labels sit in the Agent group.',
    input: z.object({ ...pageArgs, query: queryArg.optional(), team: teamArg.optional() }).strict(),
    readOnly: true,
    async run(context, input) {
        const filter: Record<string, unknown> = {};
        if (input.query) {
            filter.name = { containsIgnoreCase: input.query };
        }
        if (input.team) {
            filter.team = idOr('key', input.team);
        }
        const data = await context.linear.request<{ issueLabels: LinearConnection<unknown> }>(
            `query Labels($filter: IssueLabelFilter, $first: Int, $after: String) {
                issueLabels(filter: $filter, first: $first, after: $after) {
                    nodes { id name color description isGroup parent { id name } team { id key } }
                    ${pageInfoFields}
                }
            }`,
            { after: input.cursor, filter, first: input.limit }
        );
        return page(data.issueLabels);
    },
});

export const listUsers = defineTool({
    name: 'list_users',
    description: 'List workspace users, optionally matching a name.',
    input: z.object({ ...pageArgs, query: queryArg.optional() }).strict(),
    readOnly: true,
    async run(context, input) {
        const filter = input.query
            ? {
                  or: [
                      { name: { containsIgnoreCase: input.query } },
                      { displayName: { containsIgnoreCase: input.query } },
                  ],
              }
            : {};
        const data = await context.linear.request<{ users: LinearConnection<unknown> }>(
            `query Users($filter: UserFilter, $first: Int, $after: String) {
                users(filter: $filter, first: $first, after: $after) {
                    nodes { id name displayName active } ${pageInfoFields}
                }
            }`,
            { after: input.cursor, filter, first: input.limit }
        );
        return page(data.users);
    },
});

export const listCycles = defineTool({
    name: 'list_cycles',
    description: 'List cycles, optionally for one team.',
    input: z.object({ ...pageArgs, team: teamArg.optional() }).strict(),
    readOnly: true,
    async run(context, input) {
        const filter = input.team ? { team: idOr('key', input.team) } : {};
        const data = await context.linear.request<{ cycles: LinearConnection<unknown> }>(
            `query Cycles($filter: CycleFilter, $first: Int, $after: String) {
                cycles(filter: $filter, first: $first, after: $after) {
                    nodes { id number name startsAt endsAt isActive team { id key } } ${pageInfoFields}
                }
            }`,
            { after: input.cursor, filter, first: input.limit }
        );
        return page(data.cycles);
    },
});

export const searchDocuments = defineTool({
    name: 'search_documents',
    description: 'Find Linear documents by text.',
    input: z.object({ ...pageArgs, query: queryArg }).strict(),
    readOnly: true,
    async run(context, input) {
        const data = await context.linear.request<{ searchDocuments: LinearConnection<unknown> }>(
            `query SearchDocuments($term: String!, $first: Int, $after: String) {
                searchDocuments(term: $term, first: $first, after: $after) {
                    nodes { id title url updatedAt project { id name } } ${pageInfoFields}
                }
            }`,
            { after: input.cursor, first: input.limit, term: input.query }
        );
        return page(data.searchDocuments);
    },
});

export const getDocument = defineTool({
    name: 'get_document',
    description: 'Read one Linear document with its content.',
    input: z.object({ document: linearIdArg }).strict(),
    readOnly: true,
    async run(context, input) {
        const data = await context.linear.request<{ document: unknown }>(
            `query Document($id: String!) {
                document(id: $id) { id title content url updatedAt project { id name } }
            }`,
            { id: input.document }
        );
        if (!data.document) {
            throw inputError('Document not found.');
        }
        return { document: flatten(data.document) };
    },
});

export const listWorkflowStates = defineTool({
    name: 'list_workflow_states',
    description: "List a team's workflow states in board order.",
    input: z.object({ team: teamArg.optional() }).strict(),
    readOnly: true,
    async run(context, input) {
        const filter = input.team ? { team: idOr('key', input.team) } : {};
        const data = await context.linear.request<{
            workflowStates: LinearConnection<{ position: number; team: { key: string } }>;
        }>(
            `query WorkflowStates($filter: WorkflowStateFilter) {
                workflowStates(filter: $filter, first: 250) { nodes { ${workflowStateFields} } ${pageInfoFields} }
            }`,
            { filter }
        );
        const states = [...data.workflowStates.nodes].sort(
            (left, right) =>
                left.team.key.localeCompare(right.team.key) || left.position - right.position
        );
        return { items: states };
    },
});
