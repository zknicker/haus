import type { LinearTeam } from '@haus/api';
import * as z from 'zod';
import { LinearApiError, linearGraphql } from './linear-api.ts';

// What Haus reads about an actor's reach: the install facts read with a new
// token before binding, and every team a token reaches, page by page.

/** Teams read per page, and the most pages one read follows. */
const teamPageSize = 100;
const teamPageLimit = 20;

/** What an install proves about itself, read with the new token before binding. */
export interface LinearInstallFacts {
    appUser: { displayName: string; id: string };
    organization: { id: string; name: string; urlKey: string };
    teams: LinearTeam[];
}

const installFactsSchema = z.object({
    organization: z.object({ id: z.string().min(1), name: z.string(), urlKey: z.string().min(1) }),
    viewer: z.object({ displayName: z.string().min(1), id: z.string().min(1) }),
});
const teamsPageSchema = z.object({
    teams: z.object({
        nodes: z.array(
            z.object({ id: z.string().min(1), key: z.string().min(1), name: z.string() })
        ),
        pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }),
    }),
});

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
 * Every team one actor's token reaches. A workspace past the page limit
 * throws rather than syncing a partial set.
 */
export async function readLinearTeams(transport: typeof fetch, token: string) {
    const teams: LinearTeam[] = [];
    let after: string | null = null;
    for (let page = 0; page < teamPageLimit; page += 1) {
        const result: z.infer<typeof teamsPageSchema> = await linearGraphql(
            transport,
            token,
            {
                query: 'query HausTeams($first: Int!, $after: String) { teams(first: $first, after: $after) { nodes { id key name } pageInfo { hasNextPage endCursor } } }',
                variables: { after, first: teamPageSize },
            },
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

function shapeTeam(team: { id: string; key: string; name: string }): LinearTeam {
    return { id: team.id, key: team.key, name: team.name || team.key };
}
