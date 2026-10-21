import type { HeartbeatMark } from '@haus/api';
import { useState } from 'react';
import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import { formatShortTime } from '../../../../lib/format.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatDayTimeline } from './heartbeat-day-timeline.tsx';
import {
    type FeedPost,
    type FeedQuietFold,
    readKindLabel,
    readQuietFoldText,
} from './heartbeat-feed-model.ts';
import { HeartbeatRunOutcome } from './heartbeat-run-outcome.tsx';
import type { DayWindow } from './heartbeats-model.ts';

/**
 * One post in the feed: the Agent, what kind of check-in and when, its day as a
 * tiny timeline linking to the Log, then what the run came to.
 */
export function HeartbeatPost({
    agent,
    laneMarks,
    logSearch,
    post,
    serverId,
    window,
}: {
    agent: ActivityLogAgent | undefined;
    laneMarks: readonly HeartbeatMark[];
    logSearch: string;
    post: FeedPost;
    serverId: string;
    window: DayWindow;
}) {
    const name = agent?.displayName ?? 'Agent';
    const { mark } = post;
    return (
        <article
            aria-label={`${name}, ${readKindLabel(mark)}`}
            className="grid min-w-0 gap-1"
            data-heartbeat-post={mark.runId}
        >
            <header className="flex min-w-0 items-start gap-2.5">
                <EntityAvatar name={name} size={32} src={agent?.avatarUrl} />
                <div className="grid min-w-0 flex-1">
                    <span className="truncate font-medium text-sm">{name}</span>
                    <span className="truncate text-muted text-xs">
                        {`${readKindLabel(mark)} · ${formatShortTime(mark.at)}`}
                    </span>
                </div>
                <HeartbeatDayTimeline
                    agentName={name}
                    currentRunId={mark.runId}
                    marks={laneMarks}
                    to={logSearch}
                    window={window}
                />
            </header>
            <HeartbeatRunOutcome mark={mark} serverId={serverId} />
        </article>
    );
}

/** Consecutive quiet check-ins as one muted line; it opens to list their times. */
export function HeartbeatQuietFold({
    agent,
    fold,
}: {
    agent: ActivityLogAgent | undefined;
    fold: FeedQuietFold;
}) {
    const [isOpen, setOpen] = useState(false);
    const name = agent?.displayName ?? 'Agent';
    return (
        <div className="grid min-w-0 gap-1 text-muted text-xs" data-heartbeat-fold="">
            <button
                aria-expanded={isOpen}
                className="w-fit cursor-(--cursor-interactive) rounded-sm text-start hover:text-foreground"
                onClick={() => setOpen((open) => !open)}
                type="button"
            >
                {readQuietFoldText(name, fold.marks.length)}
            </button>
            {isOpen ? (
                <p className="tabular-nums">
                    {fold.marks.map((mark) => formatShortTime(mark.at)).join(' · ')}
                </p>
            ) : null}
        </div>
    );
}
