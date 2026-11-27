import * as React from 'react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useAgentLifecycle } from '../servers/agent-lifecycle.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { happeningNowAgentRows } from './captain-activity.ts';
import { type HappeningNowRow, toHappeningNowRows } from './happening-now-rows.ts';

/**
 * The Agents in a turn right now, or null until the activity snapshot settles,
 * so the list stays neutral rather than emptying, then filling.
 */
export function useHappeningNowRows(): HappeningNowRow[] | null {
    const { server } = useServerContext();
    const currentActivity = useOptionalCurrentAgentActivity();
    const lifecycles = useAgentLifecycle();
    const agents = useAgents(server.id);
    const activities = currentActivity?.activities ?? [];
    // Elapsed time ticks on the rows only while a row is actually counting up.
    const now = useRelativeNow(activities.length ? 1000 : 60_000);
    const settled = currentActivity?.isSnapshotReady === true;
    const rows = React.useMemo(
        () => toHappeningNowRows(happeningNowAgentRows(activities, lifecycles, agents.data ?? [], now)),
        [activities, agents.data, lifecycles, now]
    );

    return settled ? rows : null;
}

export function useOpenHappeningNowRow(): (row: HappeningNowRow) => void {
    const openAgentProfile = useOpenAgentProfile();
    return (row) => openAgentProfile(row.id);
}
