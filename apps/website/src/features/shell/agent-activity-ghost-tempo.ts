import type { ServerWorkState } from '../../hooks/agents/use-current-agent-activity.tsx';

export type AgentActivityGhostTempo = 'calm' | 'lively';

/**
 * The sidebar's Haus mark always carries the mesh; its drift speed carries
 * exactly one fact: is anyone working on this Server right now. The activity
 * provider has already narrowed its rows to Agents whose canonical availability
 * is `working`, so `working` is that fact and nothing here needs to re-derive it.
 *
 * An unsettled snapshot reads as calm rather than busy. The mark sits at the
 * top of every route, so guessing the other way would speed it up and drop it
 * back on every cold mount, announcing work that never happened.
 */
export function resolveAgentActivityGhostTempo(
    workState: ServerWorkState | null
): AgentActivityGhostTempo {
    return workState === 'working' ? 'lively' : 'calm';
}
