import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useActiveCloudAgentWork } from '../../../hooks/servers/use-cloud-agent-work.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useCloudAgentWorkView } from '../../cloud-agents/use-cloud-agent-work-view.ts';
import { useAgentLifecycle } from '../agent-lifecycle.tsx';
import { useServerContext } from '../server-context.ts';
import { agentProfileRoute } from '../server-routes.ts';
import { HappeningNowList } from './happening-now-list.tsx';
import { type HappeningNowRow, toHappeningNowRows } from './happening-now-rows.ts';
import { toHappeningNowWork } from './happening-now-work.ts';
import { happeningNowAgentRows } from './inbox-agent-activity.ts';
import { InboxSection, InboxSectionPending } from './inbox-section.tsx';

/**
 * Work running right now, whether or not this human started it. Both sources
 * read the snapshot they already own, and both state elapsed time; see
 * `happening-now-rows.ts` for why they share one list.
 */
export function InboxHappeningNow() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const { openWork } = useCloudAgentWorkView();
    const currentActivity = useOptionalCurrentAgentActivity();
    const lifecycles = useAgentLifecycle();
    const agents = useAgents(server.id);
    const humans = useHumanDirectory(server.id);
    const cloudAgentWork = useActiveCloudAgentWork(server.id);
    const activities = currentActivity?.activities ?? [];
    // Elapsed time ticks on the rows the same way it does on a work surface —
    // and only while a row is actually counting up.
    const now = useRelativeNow(cloudAgentWork.data?.length || activities.length ? 1000 : 60_000);
    const rows = React.useMemo(
        () =>
            toHappeningNowRows(
                toHappeningNowWork(cloudAgentWork.data ?? [], humans, agents.data ?? [], now),
                happeningNowAgentRows(activities, lifecycles, agents.data ?? [], now)
            ),
        [activities, agents.data, cloudAgentWork.data, humans, lifecycles, now]
    );
    const openRow = (row: HappeningNowRow) => {
        if (row.kind === 'work') {
            openWork(row.id);
            return;
        }
        navigate(agentProfileRoute(server.slug, row.id));
    };
    // Both reads make the same claim — that nothing is running — so the section
    // stays neutral until both have settled rather than emptying, then filling.
    const settled = currentActivity?.isSnapshotReady === true && Boolean(cloudAgentWork.data);

    return (
        <InboxSection title="Happening now">
            {settled ? (
                <HappeningNowList onOpenRow={openRow} rows={rows} />
            ) : (
                <InboxSectionPending label="Loading current Agent work" />
            )}
        </InboxSection>
    );
}
