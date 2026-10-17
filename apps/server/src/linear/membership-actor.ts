import type { LinearTeam } from '@haus/api';
import { identityWriteActor, teamNames } from './identity-write-actor.ts';
import { type LinearActor, type LinearActorContext, workspaceActor } from './linear-actor.ts';
import type { LinearToolRefusal } from './tool-results.ts';

// Membership writes (specs/linear-app.md#choosing-the-actor). Linear lets an
// app user that only reaches a team write its issues, but changing the team's
// settings (workflow states, team labels) needs team membership. A membership
// write therefore goes to an actor that is a member of every target team, and
// is refused rather than sent to one Linear would turn away.

/**
 * An Agent with an identity writes as it or is refused (`identityWriteActor`).
 * An Agent without one writes through the Haus app when it is a member of
 * every target team; otherwise `linear_team_membership_required`. A write that
 * touches no team (a workspace label) needs no membership.
 */
export function membershipWriteActor(
    context: LinearActorContext,
    targetTeams: readonly LinearTeam[]
): LinearActor | LinearToolRefusal {
    const { identity } = context;
    if (identity) {
        return identityWriteActor(context, identity, targetTeams, { membership: true });
    }
    const hausMember = new Set(context.workspace.memberTeamIds);
    const missing = targetTeams.filter((team) => !hausMember.has(team.id));
    if (missing.length === 0) {
        return workspaceActor(context, context.agentName);
    }
    return { detail: membershipDetail(missing), refused: 'linear_team_membership_required' };
}

/** Names the teams and the fix a workspace admin applies in Linear. */
function membershipDetail(teams: readonly LinearTeam[]): string {
    const settings = teams.length === 1 ? "that team's settings" : "those teams' settings";
    return `Haus isn't a member of ${teamNames(teams)} in Linear, so it can't change ${settings}. A workspace admin can add it under Linear → Settings → Applications → Haus → Team access.`;
}
