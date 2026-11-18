import type { TaskPreview, TaskReplyPreview } from '@haus/api';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useOpenTaskReference } from '../../../hooks/tasks/use-open-task-reference.ts';
import { formatRelativeTime } from '../../../lib/format.ts';
import { cn } from '../../../lib/utils.ts';
import type { TranscriptActor } from '../../chats/chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from '../../chats/chat-transcript-render-context.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { taskStateLabels } from '../task-state.ts';
import { TaskStateDisc } from '../task-state-disc.tsx';
import { taskPreviewCounts, taskPreviewLabel } from './task-preview-model.ts';

/**
 * The Tasks started from one Message, each as a preview under it (ADR 0052
 * decision 7): the Task's state, key, and title, its counts, and its newest
 * messages. A Task with no messages yet
 * shows just its header. Most Messages start none, and render nothing. The
 * previews are the Message entity's own `tasks`, carried on its row.
 */
export function TaskOriginPreviews({
    previews,
    serverId,
}: {
    previews: readonly TaskPreview[];
    serverId: string;
}) {
    if (previews.length === 0) {
        return null;
    }
    return <TaskPreviewList previews={previews} serverId={serverId} />;
}

/** Its own component, so only an origin Message's row holds the opener. */
function TaskPreviewList({
    previews,
    serverId,
}: {
    previews: readonly TaskPreview[];
    serverId: string;
}) {
    const openTask = useOpenTaskReference(serverId);
    return (
        <div className="flex w-full min-w-0 flex-col">
            {previews.map((preview) => (
                <TaskPreviewBlock
                    key={preview.taskId}
                    onOpen={() => void openTask({ key: preview.key, taskId: preview.taskId })}
                    preview={preview}
                />
            ))}
        </div>
    );
}

function TaskPreviewBlock({ onOpen, preview }: { onOpen: () => void; preview: TaskPreview }) {
    const counts = taskPreviewCounts(preview);
    const now = useRelativeNow();
    return (
        <div className="group/task card-shell relative mt-1.5 flex w-full min-w-0 max-w-(--chat-card-width) flex-col gap-1 bg-nested-surface px-2.5 py-2 shadow-(--nested-surface-ring) hover:bg-nested-surface-hover">
            <button
                aria-label={taskPreviewLabel(preview)}
                className="card-shell absolute inset-0 cursor-[var(--cursor-interactive)] outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={onOpen}
                type="button"
                {...opensPlace}
            />
            <div className="pointer-events-none relative flex min-w-0 items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span aria-label={taskStateLabels[preview.state]} role="img">
                        <TaskStateDisc state={preview.state} />
                    </span>
                    <span className="shrink-0 text-muted tabular-nums">{preview.key}</span>
                    <span className="truncate font-medium">{preview.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-semibold text-muted text-xs group-hover/task:text-foreground">
                    {counts.messages}
                    {counts.messages && counts.unread ? <span aria-hidden>·</span> : null}
                    {counts.unread ? <span className="text-accent">{counts.unread}</span> : null}
                    <Icon aria-hidden className="size-3" icon={ArrowRight01Icon} />
                </span>
            </div>
            {preview.recentMessages.length > 0 ? (
                <div className="pointer-events-none relative flex w-full min-w-0 flex-col gap-1 text-left">
                    {preview.recentMessages.map((message) => (
                        <TaskPreviewMessage key={message.id} message={message} now={now} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function TaskPreviewMessage({ message, now }: { message: TaskReplyPreview; now: number }) {
    const context = useTranscriptRenderContextOptional();
    const actor: TranscriptActor = message.authorAgentId
        ? { id: message.authorAgentId, kind: 'agent' }
        : message.authorUserId
          ? { id: message.authorUserId, kind: 'participant' }
          : null;
    const profile = actor ? context?.resolveActorProfile?.(actor) : null;
    const name = profile?.name ?? 'Unknown';
    return (
        <span className="flex min-w-0 items-center gap-1.5 text-sm leading-tight">
            <span className={cn(profile?.deleted && 'opacity-50 grayscale')}>
                <EntityAvatar name={name} size={20} src={profile?.avatarUrl} />
            </span>
            <span className="shrink-0 font-semibold">{name}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
                {messagePreviewLine(message.content)}
            </span>
            <span className="shrink-0 text-muted text-xs tabular-nums">
                {formatRelativeTime(message.createdAt, now)}
            </span>
        </span>
    );
}
