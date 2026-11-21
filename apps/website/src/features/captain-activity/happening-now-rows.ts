import type { HappeningNowAgent } from './captain-activity.ts';
import type { HappeningNowWork } from './happening-now-work.ts';

/**
 * One thing running right now. Worker and an Agent in a turn are
 * different records with the same job on this page — say what is moving and
 * for how long — so they share a row rather than a list each.
 */
export type HappeningNowRow =
    | { agent: HappeningNowAgent; id: string; kind: 'agent' }
    | { id: string; kind: 'work'; work: HappeningNowWork };

/**
 * Worker leads, because it outlives the turn that delegated it: an
 * Agent below may be between turns while the work it started keeps going.
 */
export function toHappeningNowRows(
    work: readonly HappeningNowWork[],
    agents: readonly HappeningNowAgent[]
): HappeningNowRow[] {
    return [
        ...work.map((item): HappeningNowRow => ({ id: item.id, kind: 'work', work: item })),
        ...agents.map((agent): HappeningNowRow => ({ agent, id: agent.id, kind: 'agent' })),
    ];
}
