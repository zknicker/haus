import type { HeartbeatLane } from '@haus/api';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { type FeedItem, readFeed } from './heartbeat-feed-model.ts';
import { HeartbeatPost, HeartbeatQuietFold } from './heartbeat-post.tsx';
import type { DayWindow } from './heartbeats-model.ts';

/**
 * The day's heartbeat and dream outputs as a feed, newest first: a post per
 * meaningful run, consecutive quiet check-ins folded into one muted line. Each
 * post carries its Agent's day as a tiny timeline that links to the Log.
 */
export function HeartbeatsFeed({
    agents,
    isToday,
    lanes,
    readLogSearch,
    serverId,
    window,
}: {
    agents: ReadonlyMap<string, ActivityLogAgent>;
    isToday: boolean;
    lanes: readonly HeartbeatLane[];
    readLogSearch: (runId: string | null) => string;
    serverId: string;
    window: DayWindow;
}) {
    const items = readFeed(lanes.filter((lane) => agents.has(lane.agentId)));
    const marksByAgent = new Map(lanes.map((lane) => [lane.agentId, lane.marks]));
    const hasPosts = items.some((item) => item.kind === 'post');
    return (
        <div className="grid max-w-[70ch] gap-6 px-(--trace-pad) py-5">
            {hasPosts ? null : (
                <p className="text-muted text-sm">
                    {isToday ? 'No heartbeat posts today' : 'No heartbeat posts this day'}
                </p>
            )}
            {items.map((item) => (
                <FeedEntry
                    agent={agents.get(item.agentId)}
                    item={item}
                    key={item.key}
                    laneMarks={marksByAgent.get(item.agentId) ?? []}
                    readLogSearch={readLogSearch}
                    serverId={serverId}
                    window={window}
                />
            ))}
        </div>
    );
}

function FeedEntry({
    agent,
    item,
    laneMarks,
    readLogSearch,
    serverId,
    window,
}: {
    agent: ActivityLogAgent | undefined;
    item: FeedItem;
    laneMarks: HeartbeatLane['marks'];
    readLogSearch: (runId: string | null) => string;
    serverId: string;
    window: DayWindow;
}) {
    if (item.kind === 'quiet') {
        return <HeartbeatQuietFold agent={agent} fold={item} />;
    }
    return (
        <HeartbeatPost
            agent={agent}
            laneMarks={laneMarks}
            logSearch={readLogSearch(item.mark.runId)}
            post={item}
            serverId={serverId}
            window={window}
        />
    );
}
