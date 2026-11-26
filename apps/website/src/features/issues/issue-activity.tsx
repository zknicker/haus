import type { IssueComment, IssueDetail, IssueEvent } from '@haus/api';
import { Tabs } from '@heroui/react';
import * as React from 'react';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { readReferenceMentions } from '../mentions/reference-mentions.ts';
import { useReferenceDirectory } from '../mentions/use-reference-directory.ts';
import { useServerContext } from '../servers/server-context.ts';
import { useIssueActor } from './issue-actor.ts';
import { IssueCommentBox } from './issue-comment-box.tsx';
import { ActorName, IssueChangeText } from './issue-event-text.tsx';

type ActivityFilter = 'all' | 'comments';

type ActivityEntry =
    | { comment: IssueComment; createdAt: string; id: string; kind: 'comment' }
    | { createdAt: string; event: IssueEvent; id: string; kind: 'event' };

export function IssueActivity({ detail }: { detail: IssueDetail }) {
    const [filter, setFilter] = React.useState<ActivityFilter>('all');
    const entries = React.useMemo(() => activityEntries(detail, filter), [detail, filter]);
    return (
        <section aria-label="Activity" className="issue-section">
            <div className="flex items-center justify-between gap-2">
                <h2 className="issue-section__title">Activity</h2>
                <Tabs
                    onSelectionChange={(key) => setFilter(key === 'comments' ? 'comments' : 'all')}
                    selectedKey={filter}
                >
                    <Tabs.ListContainer>
                        <Tabs.List aria-label="Activity filter">
                            <Tabs.Tab id="all">
                                All
                                <Tabs.Indicator />
                            </Tabs.Tab>
                            <Tabs.Tab id="comments">
                                Comments
                                <Tabs.Indicator />
                            </Tabs.Tab>
                        </Tabs.List>
                    </Tabs.ListContainer>
                </Tabs>
            </div>
            <ol className="issue-activity">
                {entries.map((entry) =>
                    entry.kind === 'comment' ? (
                        <CommentEntry comment={entry.comment} key={entry.id} />
                    ) : (
                        <EventEntry event={entry.event} key={entry.id} />
                    )
                )}
            </ol>
            <IssueCommentBox issueId={detail.issue.id} serverId={detail.issue.serverId} />
        </section>
    );
}

function EventEntry({ event }: { event: IssueEvent }) {
    return (
        <li className="issue-activity__event">
            <span>
                <ActorName actor={event.actor} /> <IssueChangeText change={event.change} />
            </span>
            <span className="issue-activity__time">
                <RelativeTime value={event.createdAt} />
            </span>
        </li>
    );
}

function CommentEntry({ comment }: { comment: IssueComment }) {
    const { server } = useServerContext();
    const author = useIssueActor(server.id, comment.author);
    const directory = useReferenceDirectory(server.id);
    const mentions = readReferenceMentions(comment.body, [], directory);
    const label = author?.label ?? 'Haus';
    return (
        <li
            className="issue-activity__comment"
            data-reply={comment.parentCommentId ? '' : undefined}
        >
            <EntityAvatar name={label} size={24} src={author?.avatarUrl ?? null} />
            <div className="min-w-0 flex-1">
                <div className="issue-activity__byline">
                    <span className="text-foreground font-medium">{label}</span>
                    <span className="issue-activity__time">
                        <RelativeTime value={comment.createdAt} />
                        {comment.editedAt ? ' · edited' : null}
                    </span>
                </div>
                <ReferenceMarkdown
                    content={comment.body}
                    mentions={mentions}
                    serverId={server.id}
                />
            </div>
        </li>
    );
}

function activityEntries(detail: IssueDetail, filter: ActivityFilter) {
    const replies = (rootId: string) =>
        detail.comments.filter((comment) => comment.parentCommentId === rootId).map(commentEntry);
    const roots = detail.comments
        .filter((comment) => comment.parentCommentId === null)
        .map(commentEntry);
    const events: ActivityEntry[] =
        filter === 'comments'
            ? []
            : detail.events.map((event) => ({
                  createdAt: event.createdAt,
                  event,
                  id: event.id,
                  kind: 'event',
              }));
    const ordered = [...events, ...roots].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
    );
    const threaded: ActivityEntry[] = [];
    for (const entry of ordered) {
        threaded.push(entry, ...(entry.kind === 'comment' ? replies(entry.id) : []));
    }
    return threaded;
}

function commentEntry(comment: IssueComment) {
    const entry: ActivityEntry = {
        comment,
        createdAt: comment.createdAt,
        id: comment.id,
        kind: 'comment',
    };
    return entry;
}
