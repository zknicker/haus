import { Separator } from '@heroui/react';
import { ChatMessage, ChatMessageActions } from '@heroui-pro/react';
import { Activity01Icon, AlertCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { openAgentProfilePane } from '../../hooks/pane/use-agent-profile-pane.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { cn } from '../../lib/utils.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { AgentHoverCard } from '../members/agent-hover-card.tsx';
import { AssistantReplyBody } from './assistant-reply-body.tsx';
import { ActionTooltip } from './chat-action-tooltip.tsx';
import {
    ChatTranscriptActivity,
    ChatTranscriptActivityGroup,
} from './chat-transcript-activity.tsx';
import {
    getAssistantNarrationText,
    isAssistantNarrationItem,
} from './chat-transcript-activity-utils.ts';
import {
    type AgentItemSegment,
    getTranscriptItemKey,
    groupAgentItems,
} from './chat-transcript-item-utils.ts';
import type {
    ConversationMessageLayout,
    TranscriptEntry,
    TranscriptItem,
    TranscriptRow,
} from './chat-transcript-model.ts';
import {
    getItemRunId,
    getItemSessionKey,
    isActivityBackedMessageRow,
    isStreamingPostMessageRow,
} from './chat-transcript-model.ts';
import {
    getMessageCopyText,
    useTranscriptRenderContext,
    useTranscriptRenderContextOptional,
} from './chat-transcript-render-context.tsx';
import type { SessionNoticeRow } from './chat-transcript-row-model.ts';
import { RuntimeNoticeEntry, SessionNoticeAction } from './chat-transcript-system-step.tsx';
import { transcriptTurnGeometry } from './chat-transcript-turn-geometry.ts';
import {
    getTurnCause,
    getTurnSessionMark,
    resolveMentionAgentId,
    TurnHeader,
} from './chat-transcript-turn-header.tsx';
import { UserTurnItem } from './chat-transcript-user-turn-item.tsx';
import {
    InlineReplyAction,
    InlineReplyHoverProvider,
    InlineReplyMessageSurface,
    useInlineReplyHoverState,
} from './inline-reply-action.tsx';
import { InlineReplyTurnHeader } from './inline-reply-preview.tsx';
import { AgentWidget } from './legacy-widget-row.tsx';
import { isLocalTimelineMessageMetadata } from './local-timeline-message.ts';
import { ServerTurnDetailsDrawer } from './server-turn-details-drawer.tsx';
import { MessageContextActionsProvider } from './thread/message-context-actions.tsx';
import { MessageReactionActions } from './thread/message-reactions.tsx';
import { ThreadMessageActions, ThreadMessageSurface } from './thread/thread-message-surface.tsx';
import type { TranscriptActiveReply, TranscriptActorProfile } from './transcript-contract.ts';
import { WorkspaceChangesChip } from './workspace-changes-chip.tsx';

// Quote and message share a wash that stays visible inside portaled action menus.
const turnInteractionClassName =
    'chat-transcript-turn group/turn hover:bg-background-hover has-[[data-turn-actions]_[aria-expanded=true]]:bg-background-hover';
// Transcript actions use smaller buttons and glyphs than the composer.
const turnActionClassName = 'size-7 [&_svg]:size-4';
// Hidden actions cannot intercept clicks. Only keyboard focus and open menus
// hold the bar after hover; ordinary click focus would leave it stuck open.
const turnActionsClassName = cn(
    // Deliberately quiet: a bright overlay bg or a drop shadow pops far too
    // loud in light mode, and surface-secondary reads too grey there — the
    // background token splits the difference. Dark keeps surface-secondary
    // (its background token is near-black and would read as a hole). The
    // border alone defines the edge.
    'pointer-events-none absolute -top-4 right-5 z-10 items-center gap-px rounded-full border border-border bg-background p-0.5 opacity-0 transition-none dark:bg-surface-secondary',
    'group-hover/turn:pointer-events-auto group-hover/turn:opacity-100',
    'has-[[data-focus-visible]]:pointer-events-auto has-[[data-focus-visible]]:opacity-100',
    'has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100'
);

export function TranscriptEntryView({
    activeReply,
    chatId,
    conversationLayout,
    currentSessionKey,
    defaultOpenWorkGroups = false,
    entry,
    followsRuntimeNotice,
    sessionNotice = null,
    turnStartedAt,
}: {
    activeReply: TranscriptActiveReply | null;
    chatId?: string;
    conversationLayout: ConversationMessageLayout;
    currentSessionKey?: string | null;
    defaultOpenWorkGroups?: boolean;
    entry: TranscriptEntry;
    followsRuntimeNotice?: boolean;
    sessionNotice?: SessionNoticeRow | null;
    turnStartedAt?: string | null;
}) {
    if (entry.kind === 'system') {
        if (entry.item.kind === 'row' && entry.item.row.kind === 'message') {
            return (
                <ThreadMessageSurface row={entry.item.row}>
                    {/* pl-11.5 + the surface's px-5 = avatar + gap: the message text column. */}
                    <p className="flex items-baseline gap-2 py-2 pr-5 pl-11.5 text-muted text-sm">
                        <span className="min-w-0 truncate" title={entry.item.row.message.content}>
                            {entry.item.row.message.content}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0 text-xs">
                            <RelativeTime value={entry.item.row.message.timestamp} />
                        </span>
                    </p>
                </ThreadMessageSurface>
            );
        }
        if (
            entry.item.kind === 'row' &&
            entry.item.row.kind === 'system' &&
            entry.item.row.systemKind === 'runtimeNotice'
        ) {
            return <RuntimeNoticeEntry row={entry.item.row} />;
        }

        return (
            <div className="mt-4 w-full px-3 py-2.5">
                <ChatTranscriptActivity
                    chatId={chatId}
                    currentSessionKey={currentSessionKey}
                    item={entry.item}
                />
            </div>
        );
    }

    if (entry.participant === 'user') {
        return <UserTurn entry={entry} layout={conversationLayout} />;
    }

    return (
        <AgentTurn
            activeReply={activeReply}
            chatId={chatId}
            currentSessionKey={currentSessionKey}
            defaultOpenWorkGroups={defaultOpenWorkGroups}
            entry={entry}
            followsRuntimeNotice={Boolean(followsRuntimeNotice)}
            layout={conversationLayout}
            sessionNotice={sessionNotice}
            turnStartedAt={turnStartedAt}
        />
    );
}

function UserTurn({
    entry,
    layout,
}: {
    entry: Extract<TranscriptEntry, { kind: 'turn' }>;
    layout: ConversationMessageLayout;
}) {
    const context = useTranscriptRenderContext();

    return (
        <UserTurnPresentation
            actorProfile={context.resolveActorProfile?.(entry.actor) ?? null}
            entry={entry}
            layout={layout}
        />
    );
}

function UserTurnPresentation({
    actorProfile,
    entry,
    layout,
}: {
    actorProfile: TranscriptActorProfile | null;
    entry: Extract<TranscriptEntry, { kind: 'turn' }>;
    layout: ConversationMessageLayout;
}) {
    const context = useTranscriptRenderContextOptional();
    const displayName = actorProfile?.name ?? getTurnFallbackName(entry) ?? 'You';
    const hasPendingMessage = entry.items.some(
        (item) =>
            item.kind === 'row' &&
            item.row.kind === 'message' &&
            isLocalTimelineMessageMetadata(item.row.message.metadata)
    );
    const lastMessageRow = getLastMessageRow(entry.items);
    // A send the Server has not confirmed yet cannot anchor a reaction or a
    // copy target, so its turn withholds the action island. The island is
    // absolute and invisible until hover, so confirmation moves nothing.
    const actionsRow = hasPendingMessage ? null : lastMessageRow;
    const inlineReplyHover = useInlineReplyHoverState(entry.items, lastMessageRow);

    return (
        <InlineReplyHoverProvider state={inlineReplyHover}>
            <div className={cn('relative -mx-5 px-5', lastMessageRow && turnInteractionClassName)}>
                <InlineReplyTurnHeader items={entry.items} />
                <ChatMessage.Assistant
                    className={cn(transcriptTurnGeometry.row, 'static')}
                    onMouseLeave={inlineReplyHover.clear}
                >
                    <TurnAvatar
                        avatarUrl={actorProfile?.avatarUrl}
                        deleted={actorProfile?.deleted}
                        name={displayName}
                    />
                    <ChatMessage.Body className={transcriptTurnGeometry.body}>
                        {layout.showHumanIdentity ? (
                            <TurnHeader
                                deleted={actorProfile?.deleted}
                                displayName={displayName}
                                onClick={
                                    entry.actor && context?.onActorClick && !actorProfile?.deleted
                                        ? () => context.onActorClick?.(entry.actor)
                                        : undefined
                                }
                                timestamp={entry.timestamp}
                            />
                        ) : null}
                        {entry.items.map((item) => (
                            <UserTurnItem
                                from="user"
                                item={item}
                                key={getTranscriptItemKey(item)}
                            />
                        ))}
                        {actionsRow ? (
                            <ChatMessageActions
                                className={turnActionsClassName}
                                data-turn-actions=""
                            >
                                <MessageReactionActions
                                    className={turnActionClassName}
                                    row={actionsRow}
                                />
                                {context?.onToggleReaction ? (
                                    <Separator className="h-4 self-center" orientation="vertical" />
                                ) : null}
                                <TranscriptMessageActions
                                    value={getMessageCopyText(context, actionsRow.message)}
                                />
                                <ThreadMessageActions
                                    className={turnActionClassName}
                                    row={actionsRow}
                                />
                                <InlineReplyAction className={turnActionClassName} />
                            </ChatMessageActions>
                        ) : null}
                    </ChatMessage.Body>
                </ChatMessage.Assistant>
            </div>
        </InlineReplyHoverProvider>
    );
}

function getActiveReplyText(items: TranscriptItem[]) {
    for (const item of items) {
        if (item.kind === 'activeReply') {
            return item.reply.text ?? '';
        }
    }

    return '';
}

/**
 * Agents and people share one identity mark: the uploaded square image when
 * there is one, initials otherwise.
 *
 * EntityAvatar rather than `ChatMessage.Avatar`, which takes no size and
 * hardcodes HeroUI's `md` preset. `md` rounds at `--radius * 3` while `sm` —
 * what the live-Agent path renders at 32px — rounds at `* 2`, so the two sat
 * side by side in the same column with visibly different corners at any
 * radius. One component and one preset is what actually keeps them identical.
 */
function TurnAvatar({
    avatarUrl,
    deleted = false,
    name,
}: {
    avatarUrl?: string | null;
    deleted?: boolean;
    name: string;
}) {
    return (
        <EntityAvatar
            className={cn(transcriptTurnGeometry.avatar, deleted && 'opacity-50 grayscale')}
            name={name}
            size={32}
            src={avatarUrl}
        />
    );
}

function AgentTurnAvatar({
    profile,
    name,
}: {
    profile: TranscriptActorProfile | null;
    name: string;
}) {
    if (profile?.availability.kind === 'live') {
        return (
            <AgentAvatar
                agent={{
                    availability: profile.availability.value,
                    avatarUrl: profile.avatarUrl,
                    displayName: name,
                    id: profile.id,
                }}
                className={transcriptTurnGeometry.avatar}
                size={32}
            />
        );
    }

    return <TurnAvatar avatarUrl={profile?.avatarUrl} deleted={profile?.deleted} name={name} />;
}

function AgentTurn({
    activeReply,
    chatId,
    currentSessionKey,
    defaultOpenWorkGroups,
    entry,
    followsRuntimeNotice,
    layout,
    sessionNotice,
    turnStartedAt,
}: AgentTurnProps) {
    const context = useTranscriptRenderContext();

    return (
        <AgentTurnPresentation
            activeReply={activeReply}
            actorProfile={context.resolveActorProfile?.(entry.actor) ?? null}
            chatId={chatId}
            currentSessionKey={currentSessionKey}
            defaultOpenWorkGroups={defaultOpenWorkGroups}
            entry={entry}
            followsRuntimeNotice={followsRuntimeNotice}
            layout={layout}
            sessionNotice={sessionNotice}
            turnStartedAt={turnStartedAt}
        />
    );
}

interface AgentTurnProps {
    activeReply: TranscriptActiveReply | null;
    chatId?: string;
    currentSessionKey?: string | null;
    defaultOpenWorkGroups: boolean;
    entry: Extract<TranscriptEntry, { kind: 'turn' }>;
    followsRuntimeNotice: boolean;
    layout: ConversationMessageLayout;
    sessionNotice?: SessionNoticeRow | null;
    turnStartedAt?: string | null;
}

function AgentTurnPresentation({
    activeReply,
    actorProfile,
    chatId,
    currentSessionKey,
    defaultOpenWorkGroups,
    entry,
    followsRuntimeNotice,
    layout,
    sessionNotice,
    turnStartedAt,
}: AgentTurnProps & { actorProfile: TranscriptActorProfile | null }) {
    const actorId = entry.actor?.id ?? null;
    const items = entry.items;
    const displayName = actorProfile?.name ?? getTurnFallbackName(entry) ?? 'Agent';
    const showIdentity = layout.showAgentIdentity;
    const lastMessageRow = getLastMessageRow(items);
    const lastMessage = lastMessageRow?.message ?? null;
    const turnCompletedAt = lastMessage?.timestamp ?? null;
    const context = useTranscriptRenderContext();
    const {
        canRequestMention,
        causeMarkHidden,
        composerId,
        turnDetails,
        onToggleReaction,
        profilePaneChatId,
        repliedRunIds,
        sessionMarks,
    } = context;
    const segments = groupAgentItems(items);
    const visibleSegments = filterPaneSegments(segments, repliedRunIds);
    const turnStopped =
        hasStoppedTurn(items, activeReply?.runId) || (!activeReply && hasAnyStoppedTurn(items));
    const turnActive = isActiveTurn(items, activeReply, lastMessage);
    const turnRunId = items.map(getItemRunId).find((value) => value !== null) ?? null;
    const copyValue = lastMessage?.content ?? getActiveReplyText(items);
    const inlineReplyHover = useInlineReplyHoverState(items, lastMessageRow);
    const [inspectOpen, setInspectOpen] = React.useState(false);
    const [inspectMounted, setInspectMounted] = React.useState(false);
    const openTurnDetails = React.useCallback(() => {
        setInspectMounted(true);
        setInspectOpen(true);
    }, []);
    const turnActions = (
        <>
            {lastMessageRow ? (
                <MessageReactionActions className={turnActionClassName} row={lastMessageRow} />
            ) : null}
            {lastMessageRow && onToggleReaction ? (
                <Separator className="h-4 self-center" orientation="vertical" />
            ) : null}
            {lastMessage ? (
                <TranscriptMessageActions value={getMessageCopyText(context, lastMessage)} />
            ) : copyValue ? (
                <TranscriptMessageActions disabled value={copyValue} />
            ) : null}
            {lastMessageRow ? (
                <ThreadMessageActions className={turnActionClassName} row={lastMessageRow} />
            ) : null}
            <InlineReplyAction className={turnActionClassName} />
            <ActionTooltip label="View turn details">
                <ChatMessage.Action
                    aria-label="View turn details"
                    className={turnActionClassName}
                    onPress={openTurnDetails}
                >
                    <Icon icon={Activity01Icon} strokeWidth={2} />
                </ChatMessage.Action>
            </ActionTooltip>
            {sessionNotice ? <SessionNoticeAction row={sessionNotice} /> : null}
        </>
    );

    // A lifecycle note with nothing above it is noise: a stopped turn that
    // never produced visible content drops out of the transcript entirely.
    // When the turn did produce content, the note stays as its footnote.
    if (
        visibleSegments.length === 0 ||
        visibleSegments.every(
            (segment) => segment.kind === 'item' && isTurnStatusItem(segment.item)
        )
    ) {
        return null;
    }

    return (
        <MessageContextActionsProvider onViewTurnDetails={openTurnDetails}>
            <InlineReplyHoverProvider state={inlineReplyHover}>
                <div className={cn('relative -mx-5 px-5', turnInteractionClassName)}>
                    <InlineReplyTurnHeader items={items} />
                    <ChatMessage.Assistant
                        className={cn(
                            transcriptTurnGeometry.row,
                            'static',
                            !showIdentity && followsRuntimeNotice && 'mt-0'
                        )}
                        onMouseLeave={inlineReplyHover.clear}
                    >
                        <AgentTurnProfileAvatar
                            actorId={actorId}
                            chatId={chatId}
                            displayName={displayName}
                            profile={actorProfile}
                            profilePaneChatId={profilePaneChatId}
                            serverId={turnDetails?.serverId}
                        />
                        <ChatMessage.Body className={transcriptTurnGeometry.body}>
                            {showIdentity ? (
                                <TurnHeader
                                    cause={causeMarkHidden ? null : getTurnCause(items)}
                                    composerId={composerId}
                                    deleted={actorProfile?.deleted}
                                    displayName={displayName}
                                    mentionAgentId={resolveMentionAgentId(
                                        actorId,
                                        actorProfile?.kind,
                                        canRequestMention &&
                                            Boolean(composerId) &&
                                            !actorProfile?.deleted
                                    )}
                                    sessionMark={getTurnSessionMark(
                                        items,
                                        sessionMarks,
                                        turnDetails?.serverId
                                    )}
                                    timestamp={entry.timestamp}
                                />
                            ) : null}
                            {visibleSegments.map((segment, index) => (
                                <AgentTurnSegment
                                    chatId={chatId}
                                    currentSessionKey={currentSessionKey}
                                    defaultOpenWorkGroups={defaultOpenWorkGroups}
                                    key={segment.key}
                                    revealNarration={turnActive}
                                    segment={segment}
                                    turnActive={turnActive && index === visibleSegments.length - 1}
                                    turnCompletedAt={turnCompletedAt}
                                    turnStartedAt={turnStartedAt}
                                    turnStopped={turnStopped}
                                />
                            ))}
                            <ChatMessageActions
                                className={turnActionsClassName}
                                data-turn-actions=""
                            >
                                {turnActions}
                            </ChatMessageActions>
                        </ChatMessage.Body>
                        {/* Mounted on first use so long transcripts don't pay a drawer per turn. */}
                        {inspectMounted && turnDetails ? (
                            <ServerTurnDetailsDrawer
                                access={turnDetails.access}
                                agentAvatarUrl={actorProfile?.avatarUrl ?? null}
                                agentId={actorId}
                                agentName={displayName}
                                onOpenChange={setInspectOpen}
                                open={inspectOpen}
                                runId={turnRunId}
                                serverId={turnDetails.serverId}
                            />
                        ) : null}
                    </ChatMessage.Assistant>
                </div>
            </InlineReplyHoverProvider>
        </MessageContextActionsProvider>
    );
}

function AgentTurnProfileAvatar({
    actorId,
    chatId,
    displayName,
    profile,
    profilePaneChatId,
    serverId,
}: {
    actorId: string | null;
    chatId?: string;
    displayName: string;
    profile: TranscriptActorProfile | null;
    profilePaneChatId?: string;
    serverId?: string;
}) {
    const avatar = <AgentTurnAvatar name={displayName} profile={profile} />;
    if (!(chatId && actorId && profilePaneChatId) || profile?.deleted) {
        return avatar;
    }

    const trigger = (
        <button
            aria-label={`Agent details: ${displayName}`}
            className="shrink-0 cursor-(--cursor-interactive) self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => openAgentProfilePane(profilePaneChatId, actorId)}
            type="button"
        >
            {avatar}
        </button>
    );

    return serverId && profile?.kind === 'agent' ? (
        <AgentHoverCard agentId={actorId} agentName={displayName} serverId={serverId}>
            {trigger}
        </AgentHoverCard>
    ) : (
        trigger
    );
}

// Exported for the turn drawer, which renders a turn's full segment list —
// activity groups included — outside the transcript pane.
export function AgentTurnSegment({
    chatId,
    currentSessionKey,
    defaultOpenWorkGroups,
    revealNarration = false,
    segment,
    turnActive,
    turnCompletedAt,
    turnStopped,
    turnStartedAt,
}: {
    chatId?: string;
    currentSessionKey?: string | null;
    defaultOpenWorkGroups: boolean;
    revealNarration?: boolean;
    segment: AgentItemSegment;
    turnActive: boolean;
    turnCompletedAt: string | null;
    turnStopped: boolean;
    turnStartedAt?: string | null;
}) {
    if (segment.kind === 'activity') {
        return (
            <ChatTranscriptActivityGroup
                chatId={chatId}
                currentSessionKey={currentSessionKey}
                defaultOpen={defaultOpenWorkGroups}
                items={segment.items}
                showDurationHeader={false}
                turnActive={turnActive}
                turnCompletedAt={turnCompletedAt}
                turnStartedAt={turnStartedAt}
                turnStopped={turnStopped}
            />
        );
    }

    return (
        <AgentTurnItem
            chatId={chatId}
            currentSessionKey={currentSessionKey}
            item={segment.item}
            revealNarration={revealNarration}
        />
    );
}

function isActiveStatusSegment(segment: AgentItemSegment) {
    return segment.kind === 'item' && segment.item.kind === 'activeStatus';
}

// The chat pane shows only the turn's latest narration and the final
// response. Narration (preamble and intra-turn updates) renders through one
// replace-in-place slot while the turn runs and drops once the run's final
// reply arrives; the full narration history stays in the turn drawer.
// Tool, thinking, and other work activity lives in the turn drawer too —
// except clarifications, which are conversational and must stay visible.
// Exported for tests only.
export function filterPaneSegments(
    segments: AgentItemSegment[],
    repliedRunIds: ReadonlySet<string> = new Set()
): AgentItemSegment[] {
    // A run's reply usually sits in this entry, but turn splits (interleaved
    // rows, runtime notices) can land it in a sibling entry — the transcript
    // provides those runs via repliedRunIds.
    const entryRepliedRunIds = new Set(
        segments.flatMap((segment) =>
            segment.kind === 'item' && isFinalReplyItem(segment.item)
                ? [getItemRunId(segment.item)]
                : []
        )
    );
    const lastNarrationKeyByRun = new Map<string | null, string>();

    for (const segment of segments) {
        if (segment.kind === 'item' && isNarrationItem(segment.item)) {
            lastNarrationKeyByRun.set(getItemRunId(segment.item), segment.key);
        }
    }

    return segments.flatMap((segment): AgentItemSegment[] => {
        if (segment.kind !== 'activity') {
            if (isActiveStatusSegment(segment)) {
                return [];
            }

            if (segment.kind === 'item' && isNarrationItem(segment.item)) {
                const runId = getItemRunId(segment.item);

                if (
                    entryRepliedRunIds.has(runId) ||
                    (runId !== null && repliedRunIds.has(runId)) ||
                    lastNarrationKeyByRun.get(runId) !== segment.key
                ) {
                    return [];
                }

                // One stable key per run: successive narration updates render
                // through the same slot, so each replaces the previous one in
                // place instead of appending a new row.
                return [{ ...segment, key: `narration:${runId ?? segment.key}` }];
            }

            return [segment];
        }

        const clarifications = segment.items.filter(isClarificationItem);
        // Changed-files chips are contribution outcome and render standalone
        // (item segments), never inside a collapsed work group.
        const fileChangeSegments = segment.items
            .filter(isWorkspaceChangesItem)
            .map((item, index): AgentItemSegment => {
                const key =
                    item.kind === 'row' ? item.row.id : `${segment.key}:files:${String(index)}`;
                return { item, key, kind: 'item' };
            });

        return [
            ...(clarifications.length > 0
                ? [{ ...segment, items: clarifications, key: `${segment.key}:clarify` }]
                : []),
            ...fileChangeSegments,
        ];
    });
}

function isStreamingPostRow(row: Extract<TranscriptItem, { kind: 'row' }>['row']) {
    return (
        row.kind === 'message' &&
        row.message.senderType === 'agent' &&
        isStreamingPostMessageRow(row)
    );
}

function isNarrationItem(item: TranscriptItem) {
    return (
        isAssistantNarrationItem(item) ||
        (item.kind === 'row' &&
            item.row.kind === 'message' &&
            item.row.message.senderType === 'agent' &&
            isActivityBackedMessageRow(item.row))
    );
}

function isFinalReplyItem(item: TranscriptItem) {
    if (item.kind === 'activeReply') {
        return true;
    }

    return (
        item.kind === 'row' &&
        item.row.kind === 'message' &&
        item.row.message.senderType === 'agent' &&
        !isActivityBackedMessageRow(item.row)
    );
}

function isClarificationItem(item: TranscriptItem) {
    return item.kind === 'row' && item.row.kind === 'tool' && Boolean(item.row.clarification);
}

function isWorkspaceChangesItem(item: TranscriptItem) {
    return (
        item.kind === 'row' &&
        item.row.kind === 'tool' &&
        item.row.toolCall.name === 'workspace_changes'
    );
}

function AgentTurnItem({
    chatId,
    currentSessionKey,
    item,
    revealNarration = false,
}: {
    chatId?: string;
    currentSessionKey?: string | null;
    item: TranscriptItem;
    revealNarration?: boolean;
}) {
    if (item.kind === 'activeReply') {
        return (
            <AssistantReplyBody
                content={getActiveReplyDisplayText(item.reply.text ?? '')}
                revealKey={item.reply.runId}
                revealText={isStreamingActiveReply(item.reply)}
                slotKey={item.reply.runId}
            />
        );
    }

    if (item.kind === 'activeStatus') {
        return null;
    }

    if (isAssistantNarrationItem(item)) {
        return <AssistantNarrationText item={item} />;
    }

    if (item.kind === 'row' && item.row.kind === 'message') {
        const row = item.row;
        // A streaming post is the turn's contribution mid-edit: reveal its
        // text like a live reply and keep partial widget fences hidden.
        const streaming = revealNarration && isStreamingPostRow(row);

        if (streaming) {
            // A streaming post is not durable yet (a silent turn discards
            // it), so it offers no thread affordances.
            return (
                <AssistantReplyBody
                    content={getActiveReplyDisplayText(row.message.content)}
                    revealKey={row.id}
                    revealText
                    slotKey={getItemRunId(item) ?? row.id}
                />
            );
        }

        const narration = revealNarration && isActivityBackedMessageRow(row);

        return (
            <InlineReplyMessageSurface row={row}>
                <AssistantReplyBody
                    message={row.message}
                    {...(narration
                        ? {
                              revealKey: row.id,
                              revealText: true,
                              slotKey: getItemRunId(item) ?? row.id,
                          }
                        : {})}
                />
            </InlineReplyMessageSurface>
        );
    }

    if (item.kind === 'row' && item.row.kind === 'widget') {
        return <AgentWidget row={item.row} />;
    }

    if (item.kind === 'row' && item.row.kind === 'tool' && isWorkspaceChangesItem(item)) {
        return <WorkspaceChangesChip chatId={chatId} row={item.row} />;
    }

    if (isTurnStatusItem(item)) {
        return <AgentTurnStatus item={item} />;
    }

    return (
        <ChatTranscriptActivity chatId={chatId} currentSessionKey={currentSessionKey} item={item} />
    );
}

function AssistantNarrationText({ item }: { item: TranscriptItem }) {
    const text = getAssistantNarrationText(item);

    return text ? (
        <div className="min-w-0 max-w-[46rem] whitespace-pre-wrap break-words text-base text-foreground leading-6 [overflow-wrap:anywhere]">
            {text}
        </div>
    ) : null;
}

function isStreamingActiveReply(reply: TranscriptActiveReply) {
    return !reply.completedAt;
}

export function getActiveReplyDisplayText(text: string) {
    return text.trimStart().trimEnd();
}

function AgentTurnStatus({
    item,
}: {
    item: Extract<TranscriptItem, { kind: 'row' }> & {
        row: Extract<TranscriptRow, { kind: 'system'; systemKind: 'turnStatus' }>;
    };
}) {
    // A stopped turn is a quiet lifecycle note, not an error: the icon shares
    // the text's muted color so the row reads as a footnote under whatever
    // the turn already produced.
    return (
        <p className="max-w-[34rem] pl-0.5 text-muted text-sm leading-5">
            <Icon
                aria-hidden
                className="mr-1.5 inline-block size-3.5 shrink-0 align-[-0.2em]"
                icon={AlertCircleIcon}
                strokeWidth={2}
            />
            <span className="font-medium">{item.row.turnStatus.text}</span>
        </p>
    );
}

function isTurnStatusItem(item: TranscriptItem): item is Extract<
    TranscriptItem,
    { kind: 'row' }
> & {
    row: Extract<TranscriptRow, { kind: 'system'; systemKind: 'turnStatus' }>;
} {
    return (
        item.kind === 'row' && item.row.kind === 'system' && item.row.systemKind === 'turnStatus'
    );
}

function TranscriptMessageActions({
    disabled = false,
    value,
}: {
    disabled?: boolean;
    value: string;
}) {
    const label = disabled ? 'Copy available when complete' : 'Copy message';

    return (
        <ActionTooltip label={label}>
            <ChatMessageActions.Copy
                aria-label={label}
                className={turnActionClassName}
                isDisabled={disabled}
                onPress={() => void writeClipboardText(value)}
            />
        </ActionTooltip>
    );
}

/**
 * One fire, one message — so a turn provoked by an automation carries exactly
 * one caused message, and its cause is the turn's. Scans forward so that if a
 * turn ever did hold two, the header names the one that opened it.
 */
function getLastMessageRow(items: TranscriptItem[]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];

        if (
            item?.kind === 'row' &&
            item.row.kind === 'message' &&
            !isActivityBackedMessageRow(item.row)
        ) {
            return item.row;
        }
    }

    return null;
}

function getLastMessage(items: TranscriptItem[]) {
    return getLastMessageRow(items)?.message ?? null;
}

function isActiveTurn(
    items: TranscriptItem[],
    activeReply: TranscriptActiveReply | null,
    lastMessage: Extract<TranscriptRow, { kind: 'message' }>['message'] | null
) {
    if (!activeReply || activeReply.completedAt || hasStoppedTurn(items, activeReply.runId)) {
        return false;
    }

    // The turn's post exists from its first streamed content and edits in
    // place while the run is live; only a finalized last message means the
    // turn has landed its reply.
    if (lastMessage !== null && !isStreamingMessageMetadata(lastMessage.metadata)) {
        return false;
    }

    return items.some((item) => getItemSessionKey(item) === activeReply.sessionKey);
}

function isStreamingMessageMetadata(metadata: Record<string, unknown> | null | undefined) {
    const runtime = metadata?.runtime;

    return Boolean(
        runtime &&
            typeof runtime === 'object' &&
            !Array.isArray(runtime) &&
            (runtime as Record<string, unknown>).streaming === true
    );
}

function hasStoppedTurn(items: TranscriptItem[], runId: string | null | undefined) {
    return Boolean(
        runId &&
            items.some(
                (item) =>
                    item.kind === 'row' &&
                    item.row.kind === 'system' &&
                    item.row.systemKind === 'turnStatus' &&
                    item.row.turnStatus.runId === runId
            )
    );
}

function hasAnyStoppedTurn(items: TranscriptItem[]) {
    return items.some(
        (item) =>
            item.kind === 'row' &&
            item.row.kind === 'system' &&
            item.row.systemKind === 'turnStatus'
    );
}

function getTurnFallbackName(entry: Extract<TranscriptEntry, { kind: 'turn' }>) {
    const message = getLastMessage(entry.items);
    return message?.sender ?? null;
}
