import type { FakeActor, FakeLinear } from './linear-fixture.ts';

// The fake Linear's team surface: the paged `teams` read with each team's
// `viewerMembership` and `viewerCanJoin`, and `teamMembershipCreate`.

/** Pages as Linear does: `first` per page, the cursor is the next offset. */
export function fakeTeamsPage(
    actor: FakeActor,
    variables: { after?: string | null; first?: number } = {}
) {
    const start = Number(variables.after ?? 0);
    const end = start + (variables.first ?? 50);
    const hasNextPage = end < actor.teams.length;
    return {
        nodes: actor.teams.slice(start, end).map((team) => ({
            ...team,
            viewerCanJoin: actor.joinableTeamIds?.includes(team.id) ?? false,
            viewerMembership: actor.memberTeamIds?.includes(team.id)
                ? { id: `membership-${actor.appUserId}-${team.id}` }
                : null,
        })),
        pageInfo: { endCursor: hasNextPage ? String(end) : null, hasNextPage },
    };
}

/** Records the join; refuses a team in `joinFailures`, else makes the actor a member. */
export function fakeTeamJoin(
    fake: FakeLinear,
    actor: FakeActor,
    input: { teamId: string; userId: string }
) {
    fake.joins.push({ actorAppUserId: actor.appUserId, ...input });
    if (fake.joinFailures.has(input.teamId)) {
        return Response.json({
            errors: [{ extensions: { type: 'forbidden', userPresentableMessage: 'No.' } }],
        });
    }
    actor.memberTeamIds = [...(actor.memberTeamIds ?? []), input.teamId];
    return Response.json({ data: { teamMembershipCreate: { success: true } } });
}
