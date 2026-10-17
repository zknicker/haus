import type { LinearTeam } from '@haus/api';
import * as z from 'zod';
import { LinearApiError, linearGraphql } from './linear-api.ts';

// What Haus reads about an actor's reach: the install facts read with a new
// token before binding, and every team a token reaches, page by page.

/** Teams read per page, and the most pages one read follows. */
const teamPageSize = 100;
const teamPageLimit = 20;

/**
 * One team an actor's token reaches. Access lets the app user see the team and
 * write its issues; membership (`member`) is what team settings writes need.
 * `canJoin` is Linear's `viewerCanJoin`: whether the app user may add itself.
 */
export interface LinearTeamReach extends LinearTeam {
    canJoin: boolean;
    member: boolean;
}

/** What an install proves about itself, read with the new token before binding. */
export interface LinearInstallFacts {
    appUser: { displayName: string; id: string };
    organization: { id: string; name: string; urlKey: string };
    teams: LinearTeamReach[];
}

const installFactsSchema = z.object({
    organization: z.object({ id: z.string().min(1), name: z.string(), urlKey: z.string().min(1) }),
    viewer: z.object({ displayName: z.string().min(1), id: z.string().min(1) }),
});
const teamNodeSchema = z.object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string(),
    viewerCanJoin: z.boolean(),
    // Null when the viewer is not a member of the team.
    viewerMembership: z.object({ id: z.string().min(1) }).nullable(),
});
const teamsPageSchema = z.object({
    teams: z.object({
        nodes: z.array(teamNodeSchema),
        pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }),
    }),
});

const teamsQuery =
    'query HausTeams($first: Int!, $after: String) { teams(first: $first, after: $after) { nodes { id key name viewerCanJoin viewerMembership { id } } pageInfo { hasNextPage endCursor } } }';

export async function readLinearInstallFacts(
    transport: typeof fetch,
    token: string
): Promise<LinearInstallFacts> {
    const facts = await linearGraphql(
        transport,
        token,
        {
            query: 'query HausInstall { viewer { id displayName } organization { id name urlKey } }',
        },
        installFactsSchema
    );
    return {
        appUser: facts.viewer,
        organization: {
            ...facts.organization,
            name: facts.organization.name || facts.organization.urlKey,
        },
        teams: await readLinearTeams(transport, token),
    };
}

/**
 * Every team one actor's token reaches, with its membership. A workspace past
 * the page limit throws rather than syncing a partial set.
 */
export async function readLinearTeams(
    transport: typeof fetch,
    token: string
): Promise<LinearTeamReach[]> {
    const teams: LinearTeamReach[] = [];
    let after: string | null = null;
    for (let page = 0; page < teamPageLimit; page += 1) {
        const result: z.infer<typeof teamsPageSchema> = await linearGraphql(
            transport,
            token,
            { query: teamsQuery, variables: { after, first: teamPageSize } },
            teamsPageSchema
        );
        teams.push(...result.teams.nodes.map(shapeTeam));
        const { endCursor, hasNextPage } = result.teams.pageInfo;
        if (!(hasNextPage && endCursor)) {
            return teams;
        }
        after = endCursor;
    }
    throw new LinearApiError(
        'upstream',
        `Linear reports more than ${teamPageSize * teamPageLimit} teams; Haus reads at most that many.`
    );
}

function shapeTeam(team: z.infer<typeof teamNodeSchema>): LinearTeamReach {
    return {
        canJoin: team.viewerCanJoin,
        id: team.id,
        key: team.key,
        member: team.viewerMembership !== null,
        name: team.name || team.key,
    };
}
