import { Chip } from '@heroui/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatRelativeTime } from '../../../lib/format.ts';
import { cn } from '../../../lib/utils.ts';
import type { TranscriptActor } from '../chat-transcript-model.ts';
import {
    getTranscriptMessageThread,
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { messagePreviewLine } from '../message-preview-line.ts';

/** A conversation preview exists only once its Thread contains replies. */
export function ThreadPreviewBlock({
    detail,
    headerLabel,
    headerLeading,
    headerTrailing,
    row,
}: {
    /**
     * One line the surface's own record owns, under the header. It renders
     * bare, so it carries its own `pointer-events-none`: the whole block is
     * one Open-thread button, and a solid child would punch a hole in it.
     */
    detail?: React.ReactNode;
    /**
     * What this surface is, for the button's accessible name. The marks in the
     * header sit beside the button rather than inside it, so without this the
     * only way in reads as a bare "Open thread" however much the header says.
     */
    headerLabel?: string;
    headerLeading?: React.ReactNode;
    /** Interactive chrome after the reply count, such as an overflow menu. */
    headerTrailing?: React.ReactNode;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const now = useRelativeNow();
    const thread = getTranscriptMessageThread(row);

    if (!(context && thread) || thread.replyCount === 0) {
        return null;
    }

    const replies = thread?.recentReplies ?? [];
    const replyCount = thread?.replyCount ?? 0;
    const label = replyLabel(replyCount);

    return (
        <div className="group/thread card-shell relative mt-1.5 flex w-full min-w-0 flex-col gap-1 bg-nested-surface px-2.5 py-2 shadow-(--nested-surface-ring) hover:bg-nested-surface-hover">
            <button
                aria-label={openThreadLabel(headerLabel, replyCount, label)}
                className="card-shell absolute inset-0 cursor-[var(--cursor-interactive)] outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => context.onOpenThread(row)}
                type="button"
            />
            <div className="pointer-events-none relative flex min-w-0 items-center justify-between gap-2 text-xs">
                {headerLeading ? (
                    <div className="relative z-10 min-w-0">{headerLeading}</div>
                ) : null}
                <span className="flex shrink-0 items-center gap-1 font-semibold text-muted text-xs group-hover/thread:text-foreground">
                    {label}
                    {(thread?.unreadCount ?? 0) > 0 ? (
                        <>
                            <span aria-hidden>·</span>
                            <span className="text-accent">{thread?.unreadCount} new</span>
                        </>
                    ) : null}
                    <Icon aria-hidden className="size-3" icon={ArrowRight01Icon} />
                </span>
                {headerTrailing ? (
                    <div className="pointer-events-auto relative z-10 shrink-0">
                        {headerTrailing}
                    </div>
                ) : null}
            </div>
            {detail}
            {replies.length > 0 ? (
                <div className="pointer-events-none relative flex w-full min-w-0 flex-col gap-1 text-left">
                    {replies.map((reply) => (
                        <ThreadPreviewReply
                            key={reply.id}
                            now={now}
                            reply={reply}
                            resolveActorProfile={context.resolveActorProfile}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

type ThreadReplyPreview = NonNullable<
    ReturnType<typeof getTranscriptMessageThread>
>['recentReplies'];

function ThreadPreviewReply({
    now,
    reply,
    resolveActorProfile,
}: {
    now: number;
    reply: NonNullable<ThreadReplyPreview>[number];
    resolveActorProfile?: (
        actor: TranscriptActor
    ) => { avatarUrl: null | string; deleted: boolean; name: string } | null;
}) {
    const actor: TranscriptActor = reply.authorAgentId
        ? { id: reply.authorAgentId, kind: 'agent' }
        : reply.authorUserId
          ? { id: reply.authorUserId, kind: 'participant' }
          : null;
    const profile = actor ? resolveActorProfile?.(actor) : null;
    const name = threadPreviewAuthorName(profile);

    return (
        <span className="flex min-w-0 items-center gap-1.5 text-sm leading-tight">
            <span className={cn(profile?.deleted && 'opacity-50 grayscale')}>
                <EntityAvatar name={name} size={20} src={profile?.avatarUrl} />
            </span>
            <span
                className={cn(
                    'shrink-0 font-semibold',
                    profile?.deleted ? 'text-muted' : 'text-foreground'
                )}
            >
                {name}
            </span>
            {profile?.deleted ? (
                <Chip size="sm" variant="secondary">
                    DELETED
                </Chip>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-muted">
                {messagePreviewLine(reply.content)}
            </span>
            <span className={cn('shrink-0 text-muted text-xs tabular-nums')}>
                {formatRelativeTime(reply.createdAt, now)}
            </span>
        </span>
    );
}

export function threadPreviewAuthorName(profile: { name: string } | null | undefined) {
    return profile?.name ?? 'Unknown';
}

function openThreadLabel(headerLabel: string | undefined, replyCount: number, label: string) {
    return ['Open thread', headerLabel, replyCount > 0 ? label : null]
        .filter((part) => part !== null && part !== undefined)
        .join(', ');
}

function replyLabel(replyCount: number) {
    return `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
}
