import type { Agent, Chat, ChatMessage, ClaimListItem, TaskLabel } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import {
    type ClaimOrigin,
    type ClaimStatus,
    type ClaimTier,
    claimStatusLabels,
} from '../../claims/claim-presentation.ts';
import type { TaskPriority } from '../../tasks/task-presentation.ts';
import type { HumanDirectory } from '../human-identity.ts';
import { selectStalledClaims } from './stalled-claims.ts';

export type ClaimView = 'all' | 'active' | 'unassigned';

export interface ClaimItem {
    assigneeAgentId: string | null;
    assigneeAvatarUrl: string | null;
    assigneeLabel: string;
    chatId: string;
    chatLabel: string;
    claimedAt: string | null;
    createdAt: string;
    createdByUserId: string | null;
    id: string;
    labels: TaskLabel[];
    /** The assignee Agent is running a turn on this claim right now. */
    live: boolean;
    message: ChatMessage;
    number: number;
    /** Who made the claim: a human composed or converted it, or an Agent claimed it. */
    origin: ClaimOrigin;
    priority: TaskPriority;
    status: ClaimStatus;
    threadChatId: string;
    threadSummary: ClaimListItem['threadSummary'];
    /** Which lens this claim belongs to; `background` shows only when widened. */
    tier: ClaimTier;
    /** The canonical message as one line; the Thread renders the message itself. */
    title: string;
    updatedAt: string;
    version: number;
}

export const claimStatuses: ClaimStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'closed'];

/**
 * `active` is the resting view: finished work is history, and a page that
 * opens on every claim Haus has ever closed buries the ones still moving.
 * `all` is a deliberate widening, so it is the value that rides the URL.
 */
export function resolveClaimView(value: string | null): ClaimView {
    return value === 'all' || value === 'unassigned' ? value : 'active';
}

export function claimChatOptions(chats: Chat[], humans: HumanDirectory) {
    return chats
        .filter((chat) => !chat.peerAgentRetired)
        .map((chat) => ({
            id: chat.id,
            label:
                chat.kind === 'channel'
                    ? `#${chat.name}`
                    : `DM · ${chat.peerAgentDisplayName ?? humans.name(chat.peerUserId)}`,
        }));
}

/** Claims are Agent work (ADR 0037): the assignee is an Agent or nobody. */
export function claimAssigneeName(claim: Pick<ClaimItem, 'assigneeAgentId'>, agents: Agent[]) {
    if (claim.assigneeAgentId) {
        const agent = agents.find((candidate) => candidate.id === claim.assigneeAgentId);
        return agent?.displayName ?? `Agent ${claim.assigneeAgentId.slice(-6)}`;
    }
    return 'Unassigned';
}

export function claimAssigneeAvatarUrl(claim: Pick<ClaimItem, 'assigneeAgentId'>, agents: Agent[]) {
    if (!claim.assigneeAgentId) {
        return null;
    }
    return agents.find((candidate) => candidate.id === claim.assigneeAgentId)?.avatarUrl ?? null;
}

export function toClaimItem(
    item: ClaimListItem,
    humans: HumanDirectory,
    agents: Agent[] = []
): ClaimItem {
    return {
        assigneeAgentId: item.claim.assigneeAgentId,
        assigneeAvatarUrl: claimAssigneeAvatarUrl(item.claim, agents),
        assigneeLabel: claimAssigneeName(item.claim, agents),
        chatId: item.claim.chatId,
        chatLabel: claimChatLabel(item, humans),
        claimedAt: item.claim.claimedAt,
        createdAt: item.claim.createdAt,
        createdByUserId: item.claim.createdByUserId,
        id: item.message.id,
        labels: item.claim.labels,
        live: item.claim.live,
        message: item.message,
        number: item.claim.number,
        origin: item.claim.origin,
        priority: item.claim.priority,
        status: item.claim.status,
        threadChatId: item.claim.threadChatId,
        threadSummary: item.threadSummary,
        tier: item.claim.tier,
        title: messagePreviewLine(item.message.content),
        updatedAt: item.claim.updatedAt,
        version: item.claim.version,
    };
}

/**
 * Where the claim lives. An Agent DM has no human peer to name, so it reads as
 * `DM` rather than claiming a peer that is not there.
 */
function claimChatLabel(item: ClaimListItem, humans: HumanDirectory): string {
    if (item.chatKind === 'channel') {
        return `#${item.chatName ?? 'channel'}`;
    }
    return item.chatPeerUserId ? `DM · ${humans.name(item.chatPeerUserId)}` : 'DM';
}

export interface ClaimFilterInput {
    /** An Agent id, or the literal `unassigned`. */
    assignee?: null | string;
    labelId?: null | string;
    priority?: null | string;
    status?: null | string;
    view: ClaimView;
}

export function filterClaims(claims: ClaimItem[], input: ClaimFilterInput) {
    return claims.filter((claim) => {
        // `active` is a standing guess about which statuses matter; an
        // explicit Status is the reader answering that same question
        // outright, so it wins. Without this, asking for Done on the resting
        // view returns nothing and the page never says why.
        if (
            input.view === 'active' &&
            !input.status &&
            (claim.status === 'done' || claim.status === 'closed')
        ) {
            return false;
        }
        if (input.view === 'unassigned' && claim.assigneeAgentId !== null) {
            return false;
        }
        if (input.labelId && !claim.labels.some((label) => label.id === input.labelId)) {
            return false;
        }
        if (input.status && claim.status !== input.status) {
            return false;
        }
        if (input.priority && claim.priority !== input.priority) {
            return false;
        }
        if (input.assignee && !matchesAssignee(claim, input.assignee)) {
            return false;
        }
        return true;
    });
}

/** `unassigned` is its own bucket; anything else is an Agent id. */
function matchesAssignee(claim: ClaimItem, assignee: string) {
    if (assignee === unassignedAssignee) {
        return claim.assigneeAgentId === null;
    }
    return claim.assigneeAgentId === assignee;
}

export const unassignedAssignee = 'unassigned';

// Linear-style ordering inside a status group: most urgent first, unset last.
// Board columns and list groups both ride this so the lenses agree.
const priorityRank: Record<TaskPriority, number> = {
    high: 1,
    low: 3,
    medium: 2,
    none: 4,
    urgent: 0,
};

/** Board columns read as a pipeline, so they keep lifecycle order. */
export function groupClaims(claims: ClaimItem[]) {
    return groupClaimsBy(claims, claimStatuses);
}

/**
 * The List's groups. `in_review` leads and says so in words: a claim waiting on
 * a person is the only kind the reader can finish by looking at it, so the
 * review queue is what the page opens on. Claims an Agent stopped short of
 * finishing follow it as their own group, out of `in_progress`, because no
 * run is coming back for them — the reader decides what happens next.
 */
export function groupClaimsForList(claims: ClaimItem[]): ClaimListSection[] {
    const stalled = new Set(selectStalledClaims(claims));
    const [review, ...rest] = groupClaimsBy(
        claims.filter((claim) => !stalled.has(claim)),
        claimListStatuses
    ).map((group) => ({
        ...group,
        key: group.status,
        title: claimListGroupTitles[group.status] ?? claimStatusLabels[group.status],
    }));
    const stopped: ClaimListSection = {
        key: 'stopped',
        status: 'in_progress',
        claims: groupClaimsBy([...stalled], ['in_progress'])[0]?.claims ?? [],
        title: 'Stopped before finishing',
    };

    return review ? [review, stopped, ...rest] : [stopped, ...rest];
}

export interface ClaimListSection {
    claims: ClaimItem[];
    /** Stable across renders; the stopped group shares `in_progress`'s status. */
    key: 'stopped' | ClaimStatus;
    status: ClaimStatus;
    title: string;
}

const claimListStatuses: ClaimStatus[] = ['in_review', 'todo', 'in_progress', 'done', 'closed'];

const claimListGroupTitles: Partial<Record<ClaimStatus, string>> = {
    in_review: 'Needs your review',
};

function groupClaimsBy(claims: ClaimItem[], statuses: ClaimStatus[]) {
    return statuses.map((status) => ({
        status,
        claims: claims
            .filter((claim) => claim.status === status)
            .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    }));
}
