import * as z from 'zod';
import { linearGraphql } from './linear-api.ts';

// The workspace objects a `linear` Trigger may name, read with the workspace
// actor's token before any authoring transaction (no Linear call holds the
// Server lock). Archived objects are not listed, so a stored id missing from a
// complete list is unavailable.

export interface LinearCatalogLabel {
    id: string;
    name: string;
    /** Null for a workspace label. */
    teamId: string | null;
}

export interface LinearCatalogState {
    id: string;
    name: string;
    teamId: string;
    type: string;
}

export interface LinearCatalogProject {
    id: string;
    name: string;
    teamIds: string[];
    url: string;
}

export interface LinearCatalogUser {
    displayName: string;
    email: string | null;
    id: string;
    name: string;
}

export interface LinearCatalog {
    /** False when a list had more than one page: absence then proves nothing. */
    complete: boolean;
    labels: LinearCatalogLabel[];
    projectStatuses: { id: string; name: string }[];
    projects: LinearCatalogProject[];
    states: LinearCatalogState[];
    users: LinearCatalogUser[];
}

const page = <T extends z.ZodType>(node: T) =>
    z.object({
        nodes: z.array(node),
        pageInfo: z.object({ hasNextPage: z.boolean() }),
    });
const idOnly = z.object({ id: z.string().min(1) });

const catalogSchema = z.object({
    issueLabels: page(
        z.object({
            id: z.string().min(1),
            isGroup: z.boolean().optional(),
            name: z.string(),
            team: idOnly.nullable().optional(),
        })
    ),
    projectStatuses: page(z.object({ id: z.string().min(1), name: z.string() })),
    projects: page(
        z.object({
            id: z.string().min(1),
            name: z.string(),
            teams: z.object({ nodes: z.array(idOnly) }),
            url: z.string(),
        })
    ),
    users: page(
        z.object({
            displayName: z.string(),
            email: z.string().nullable().optional(),
            id: z.string().min(1),
            name: z.string(),
        })
    ),
    workflowStates: page(
        z.object({
            id: z.string().min(1),
            name: z.string(),
            team: idOnly,
            type: z.string(),
        })
    ),
});

const catalogQuery = `query HausTriggerCatalog {
    issueLabels(first: 250) { nodes { id name isGroup team { id } } pageInfo { hasNextPage } }
    workflowStates(first: 250) { nodes { id name type team { id } } pageInfo { hasNextPage } }
    projects(first: 250) { nodes { id name url teams(first: 50) { nodes { id } } } pageInfo { hasNextPage } }
    projectStatuses(first: 100) { nodes { id name } pageInfo { hasNextPage } }
    users(first: 250) { nodes { id name displayName email } pageInfo { hasNextPage } }
}`;

/** One read of every list a Trigger can reference. Throws on any Linear failure. */
export async function readLinearTriggerCatalog(
    transport: typeof fetch,
    token: string
): Promise<LinearCatalog> {
    const result = await linearGraphql(transport, token, { query: catalogQuery }, catalogSchema);
    return {
        complete: [
            result.issueLabels,
            result.workflowStates,
            result.projects,
            result.projectStatuses,
            result.users,
        ].every((list) => !list.pageInfo.hasNextPage),
        // A group label is never on an issue; only its children are.
        labels: result.issueLabels.nodes
            .filter((label) => label.isGroup !== true)
            .map((label) => ({ id: label.id, name: label.name, teamId: label.team?.id ?? null })),
        projectStatuses: result.projectStatuses.nodes,
        projects: result.projects.nodes.map((project) => ({
            id: project.id,
            name: project.name,
            teamIds: project.teams.nodes.map((team) => team.id),
            url: project.url,
        })),
        states: result.workflowStates.nodes.map((state) => ({
            id: state.id,
            name: state.name,
            teamId: state.team.id,
            type: state.type,
        })),
        users: result.users.nodes.map((user) => ({
            displayName: user.displayName,
            email: user.email ?? null,
            id: user.id,
            name: user.name,
        })),
    };
}

/** Every referenceable id the catalog lists. */
export function catalogIds(catalog: LinearCatalog): Set<string> {
    return new Set([
        ...catalog.labels.map((label) => label.id),
        ...catalog.states.map((state) => state.id),
        ...catalog.projects.map((project) => project.id),
        ...catalog.projectStatuses.map((status) => status.id),
        ...catalog.users.map((user) => user.id),
    ]);
}
