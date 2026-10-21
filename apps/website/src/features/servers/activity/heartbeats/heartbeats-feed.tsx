import type { HeartbeatLane } from '@haus/api';
import { DayDivider, formatDayLabel } from '../../../../components/chats/day-divider.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import type { FeedDay, FeedEntry } from './heartbeat-feed-model.ts';
import { HeartbeatNote, HeartbeatPost } from './heartbeat-post.tsx';
import { readDayBounds } from './heartbeats-model.ts';

/**
 * The feed: one centered column of posts and system notes, newest first, under
 * the same day dividers the channels use. Older days keep arriving below.
 */
export function HeartbeatsFeed({
    agents,
    days,
    lanes,
    readLogSearch,
    serverId,
}: {
    agents: ReadonlyMap<string, ActivityLogAgent>;
    days: readonly FeedDay[];
    lanes: readonly HeartbeatLane[];
    readLogSearch: (runId: string | null) => string;
    serverId: string;
}) {
    const marksByAgent = new Map(lanes.map((lane) => [lane.agentId, lane.marks]));
    return (
        <>
            {days.map((day) => (
                <section aria-label={formatDayLabel(new Date(day.startMs))} key={day.startMs}>
                    <DayDivider
                        className="mt-5 mb-1"
                        label={formatDayLabel(new Date(day.startMs))}
                    />
                    <div className="divide-y divide-separator">
                        {day.entries.map((entry) => (
                            <FeedRow
                                agent={agents.get(entry.agentId)}
                                dayMarks={(marksByAgent.get(entry.agentId) ?? []).filter(
                                    (mark) =>
                                        readDayBounds(Date.parse(mark.at)).startMs === day.startMs
                                )}
                                entry={entry}
                                key={entry.key}
                                logSearch={readLogSearch(entry.mark.runId)}
                                serverId={serverId}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </>
    );
}

function FeedRow({
    agent,
    dayMarks,
    entry,
    logSearch,
    serverId,
}: {
    agent: ActivityLogAgent | undefined;
    dayMarks: HeartbeatLane['marks'];
    entry: FeedEntry;
    logSearch: string;
    serverId: string;
}) {
    return entry.kind === 'note' ? (
        <HeartbeatNote agent={agent} logSearch={logSearch} note={entry} serverId={serverId} />
    ) : (
        <HeartbeatPost
            agent={agent}
            dayMarks={dayMarks}
            logSearch={logSearch}
            post={entry}
            serverId={serverId}
        />
    );
}
