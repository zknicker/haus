import type { HappeningNowAgent } from './captain-activity.ts';

/** One Agent in a turn right now. */
export interface HappeningNowRow {
    agent: HappeningNowAgent;
    id: string;
    kind: 'agent';
}

export function toHappeningNowRows(agents: readonly HappeningNowAgent[]): HappeningNowRow[] {
    return agents.map((agent) => ({ agent, id: agent.id, kind: 'agent' }));
}
