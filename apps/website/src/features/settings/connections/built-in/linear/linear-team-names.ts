/** Names shown before the rest of a missing-team list folds into "+N". */
const missingTeamNamesShown = 2;

/**
 * "Not a member of Design", "Not a member of Design, Ops", or
 * "Not a member of Design, Ops +1", for a non-empty list of team names.
 */
export function notMemberOfTeams(names: readonly string[]): string {
    const shown = names.slice(0, missingTeamNamesShown).join(', ');
    const more = names.length - missingTeamNamesShown;
    return `Not a member of ${shown}${more > 0 ? ` +${more}` : ''}`;
}
