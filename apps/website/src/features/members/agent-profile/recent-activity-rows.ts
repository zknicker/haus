import type { AgentActivityTurn } from './agent-activity-turns.ts';

/**
 * One row of the hub's Recent activity: a single turn, or a run of consecutive
 * identical failures folded into one so a crash loop reads as one fact
 * ("Failed after 2m · 5× since 4:33 PM") instead of five identical rows.
 */
export interface RecentActivityRow {
    /** How many turns the row stands for; 1 for an ordinary turn. */
    readonly count: number;
    /** The newest turn in the row; its headline and phase speak for the row. */
    readonly latest: AgentActivityTurn;
    /** The oldest turn's start, which a folded row reads as "since". */
    readonly since: string;
}

/**
 * Folds consecutive failed turns with the same failure kind and trigger. Turns arrive
 * newest first (as `groupAgentActivityTurns` sorts them), so the first turn of
 * a run is the latest and the last is where the run began. Only failures fold:
 * completed turns are distinct work, and a repeat there is not a symptom.
 */
export function collapseRecentActivity(
    turns: readonly AgentActivityTurn[],
    limit: number
): RecentActivityRow[] {
    const rows: RecentActivityRow[] = [];
    for (const turn of turns) {
        const previous = rows.at(-1);
        if (previous && isSameFailure(previous.latest, turn)) {
            rows[rows.length - 1] = {
                count: previous.count + 1,
                latest: previous.latest,
                since: turn.startedAt,
            };
            continue;
        }
        if (rows.length === limit) {
            break;
        }
        rows.push({ count: 1, latest: turn, since: turn.startedAt });
    }
    return rows;
}

function isSameFailure(left: AgentActivityTurn, right: AgentActivityTurn): boolean {
    return (
        left.kind === 'settled' &&
        right.kind === 'settled' &&
        left.status === 'failed' &&
        right.status === 'failed' &&
        left.failureKind === right.failureKind &&
        sameTrigger(left.trigger, right.trigger)
    );
}

/** A retry loop re-runs one request; different requests failing alike stay apart. */
function sameTrigger(left: AgentActivityTurn['trigger'], right: AgentActivityTurn['trigger']) {
    return JSON.stringify(left) === JSON.stringify(right);
}
