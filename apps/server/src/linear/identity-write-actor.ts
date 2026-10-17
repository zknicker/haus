import type { LinearTeam } from '@haus/api';
import { identityActor, type LinearActor, type LinearActorContext } from './linear-actor.ts';
import { effectiveIdentityTeams } from './team-access.ts';
import type { LinearToolRefusal } from './tool-results.ts';

// Identity holders always write as their identity (specs/linear-app.md#choosing-the-actor;
// decided 2026-10-17). There is no fallback to the Haus app: a write the
// identity's app cannot make is refused, naming the Agent's app and the Linear
// setting a workspace admin changes.

/**
 * The identity when every target team is in its effective access and, for a
 * membership write, the identity is a member of each; otherwise a refusal.
 * A write that touches no team needs neither.
 */
export function identityWriteActor(
    context: LinearActorContext,
    identity: NonNullable<LinearActorContext['identity']>,
    targetTeams: readonly LinearTeam[],
    input: { membership: boolean }
): LinearActor | LinearToolRefusal {
    const effective = new Set(
        effectiveIdentityTeams(identity.teams, context.workspace.teams).map((team) => team.id)
    );
    const unreachable = targetTeams.filter((team) => !effective.has(team.id));
    if (unreachable.length > 0) {
        return {
            detail: `${context.agentName}'s Linear app can't reach ${teamNames(unreachable)}. ${adminFix(context.agentName, 'change its team access')}`,
            refused: 'linear_team_outside_access',
        };
    }
    if (input.membership) {
        const member = new Set(identity.memberTeamIds);
        const missing = targetTeams.filter((team) => !member.has(team.id));
        if (missing.length > 0) {
            const settings =
                missing.length === 1 ? "that team's settings" : "those teams' settings";
            return {
                detail: `${context.agentName}'s Linear app isn't a member of ${teamNames(missing)}, so it can't change ${settings}. ${adminFix(context.agentName, 'add it')}`,
                refused: 'linear_team_membership_required',
            };
        }
    }
    return identityActor(identity);
}

/** "Design", "Design and Ops", "Design, Ops, and Legal". */
export function teamNames(teams: readonly LinearTeam[]): string {
    return new Intl.ListFormat('en', { type: 'conjunction' }).format(
        teams.map((team) => team.name)
    );
}

function adminFix(appName: string, action: string): string {
    return `A workspace admin can ${action} under Linear → Settings → Applications → ${appName} → Team access.`;
}
