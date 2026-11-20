import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { tabIntentState } from '../../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useActiveWorker } from '../../../hooks/servers/use-worker.ts';
import { useOpenWorker } from '../../workers/use-open-worker.ts';
import { useAgentLifecycle } from '../agent-lifecycle.tsx';
import { useServerContext } from '../server-context.ts';
import { taskRoute } from '../server-routes.ts';
import { type HappeningNowRow, toHappeningNowRows } from './happening-now-rows.ts';
import { toHappeningNowWork } from './happening-now-work.ts';
import { happeningNowAgentRows } from './inbox-agent-activity.ts';

/**
 * Work running right now, whether or not this human started it, or null until
 * both of its reads settle. Both sources read the snapshot they already own,
 * and both state elapsed time; see `happening-now-rows.ts` for why they share
 * one list.
 *
 * Both reads make the same claim — that nothing is running — so the list stays
 * neutral until both have settled rather than emptying, then filling.
 */
export function useHappeningNowRows(): HappeningNowRow[] | null {
    const { server } = useServerContext();
    const currentActivity = useOptionalCurrentAgentActivity();
    const lifecycles = useAgentLifecycle();
    const agents = useAgents(server.id);
    const humans = useHumanDirectory(server.id);
    const worker = useActiveWorker(server.id);
    const activities = currentActivity?.activities ?? [];
    // Elapsed time ticks on the rows the same way it does on a work surface —
    // and only while a row is actually counting up.
    const now = useRelativeNow(worker.data?.length || activities.length ? 1000 : 60_000);
    const settled = currentActivity?.isSnapshotReady === true && Boolean(worker.data);
    const rows = React.useMemo(
        () =>
            toHappeningNowRows(
                toHappeningNowWork(worker.data ?? [], humans, agents.data ?? [], now),
                happeningNowAgentRows(activities, lifecycles, agents.data ?? [], now)
            ),
        [activities, agents.data, worker.data, humans, lifecycles, now]
    );

    return settled ? rows : null;
}

export function useOpenHappeningNowRow(): (row: HappeningNowRow) => void {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const openAgentProfile = useOpenAgentProfile();
    const openWork = useOpenWorker();
    return (row) => {
        if (row.kind === 'work') {
            if (row.work.task) {
                navigate(taskRoute(server.slug, row.work.task.key), {
                    state: tabIntentState(currentOpenGesture()),
                });
                return;
            }
            openWork(row.work);
            return;
        }
        openAgentProfile(row.id);
    };
}
