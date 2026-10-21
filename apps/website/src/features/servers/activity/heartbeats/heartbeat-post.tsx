import type { HeartbeatMark } from '@haus/api';
import { Chip } from '@heroui/react';
import { Link } from 'react-router-dom';
import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import { formatShortTime } from '../../../../lib/format.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatDayTimeline } from './heartbeat-day-timeline.tsx';
import { HeartbeatDreamLink } from './heartbeat-dream-link.tsx';
import { type FeedNote, type FeedPost, readDreamNote } from './heartbeat-feed-model.ts';
import { HeartbeatNoteGlyph } from './heartbeat-glyph.tsx';
import { HeartbeatThoughts } from './heartbeat-thoughts.tsx';
import { readDayBounds } from './heartbeats-model.ts';

/**
 * One post: a 40px avatar column, then the header line (name, what the Agent
 * did, when, and its day as a tiny timeline), the thoughts, and a quiet footer.
 */
export function HeartbeatPost({
    agent,
    dayMarks,
    logSearch,
    post,
    serverId,
}: {
    agent: ActivityLogAgent | undefined;
    /** The Agent's marks on the post's day, for the timeline. */
    dayMarks: readonly HeartbeatMark[];
    logSearch: string;
    post: FeedPost;
    serverId: string;
}) {
    const name = agent?.displayName ?? 'Agent';
    const { mark } = post;
    const isDream = post.postKind === 'dreamed';
    return (
        <article
            aria-label={`${name}, ${isDream ? 'dreamed' : 'noticed'}`}
            className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-4"
            data-heartbeat-post={mark.runId}
        >
            <EntityAvatar name={name} size={40} src={agent?.avatarUrl} />
            <div className="min-w-0">
                <header className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="truncate font-semibold">{name}</span>
                    {isDream ? (
                        <Chip className="chip--dream" size="sm" variant="soft">
                            Dreamed
                        </Chip>
                    ) : (
                        <Chip color="accent" size="sm" variant="soft">
                            Noticed
                        </Chip>
                    )}
                    <span className="shrink-0 text-muted text-xs">{formatShortTime(mark.at)}</span>
                    <HeartbeatDayTimeline
                        agentName={name}
                        currentRunId={mark.runId}
                        day={readDayBounds(Date.parse(mark.at))}
                        marks={dayMarks}
                        to={logSearch}
                    />
                </header>
                <HeartbeatThoughts logSearch={logSearch} post={post} serverId={serverId} />
            </div>
        </article>
    );
}

/**
 * A failed or yielded run as a system note, in the voice of a channel's system
 * rows: a small muted line with a glyph, in the avatar column. Danger tints
 * only the glyph and the phrase.
 */
export function HeartbeatNote({
    agent,
    logSearch,
    note,
    serverId,
}: {
    agent: ActivityLogAgent | undefined;
    logSearch: string;
    note: FeedNote;
    serverId: string;
}) {
    const name = agent?.displayName ?? 'Agent';
    const what =
        note.mark.kind === 'nightly' ? 'dream' : `${formatShortTime(note.mark.at)} check-in`;
    const dreamNote = readDreamNote(note.mark.dream);
    return (
        <div
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 py-2.5 text-muted text-sm"
            data-heartbeat-note={note.reason}
        >
            <span className="flex justify-center">
                <HeartbeatNoteGlyph kind={note.reason} />
            </span>
            <p className="min-w-0">
                <span className="font-medium text-foreground">{name}</span>{' '}
                {note.reason === 'failed' ? (
                    <span className="text-danger">{`couldn't finish its ${what}`}</span>
                ) : null}
                {note.reason === 'yielded' ? `paused its ${what} for a new message` : null}
                {note.reason === 'dreamed' ? dreamNote.text : null}
                {note.reason === 'dreamed' ? (
                    dreamNote.hasMemoryChanges && note.mark.runId ? (
                        <>
                            {' · '}
                            <HeartbeatDreamLink
                                agentId={note.agentId}
                                runId={note.mark.runId}
                                serverId={serverId}
                            />
                        </>
                    ) : null
                ) : (
                    <>
                        {' · '}
                        <Link className="text-accent hover:underline" to={logSearch}>
                            View run
                        </Link>
                    </>
                )}
            </p>
        </div>
    );
}
