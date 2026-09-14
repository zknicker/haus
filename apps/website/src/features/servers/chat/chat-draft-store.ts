import type { Mention } from '../../mentions/mention-types.ts';
import {
    type ComposerAttachment,
    createComposerAttachment,
    revokeComposerAttachment,
} from './chat-draft-attachments.ts';

export interface ChatDraftContents {
    attachments: ComposerAttachment[];
    content: string;
    mentions: Mention[];
}

export interface FailedChatDraft extends ChatDraftContents {
    id: string;
}

export interface ChatDraftState {
    draft: ChatDraftContents;
    failed: readonly FailedChatDraft[];
}

const emptyDraft: ChatDraftContents = {
    attachments: [],
    content: '',
    mentions: [],
};
const emptyState: ChatDraftState = { draft: emptyDraft, failed: [] };
const drafts = new Map<string, ChatDraftState>();
const listeners = new Map<string, Set<() => void>>();

export function hasChatDrafts() {
    return drafts.size > 0;
}

export function chatDraftKey(serverId: string, chatId: string) {
    return `server:${serverId}:chat:${chatId}`;
}

export function agentDmDraftKey(serverId: string, agentId: string) {
    return `server:${serverId}:agent-dm:${agentId}`;
}

export function threadDraftKey(serverId: string, parentChatId: string, anchorMessageId: string) {
    return `server:${serverId}:thread:${parentChatId}:${anchorMessageId}`;
}

export function readChatDraftState(key: string): ChatDraftState {
    return drafts.get(key) ?? emptyState;
}

export function readChatDraft(key: string): ChatDraftContents {
    return readChatDraftState(key).draft;
}

export function updateChatDraftContent(
    key: string,
    content: string | ((current: string) => string)
) {
    const current = readChatDraftState(key);
    const nextContent = typeof content === 'function' ? content(current.draft.content) : content;

    writeChatDraftState(key, {
        ...current,
        draft: { ...current.draft, content: nextContent },
    });
}

export function updateChatDraftMentions(key: string, mentions: Mention[]) {
    const current = readChatDraftState(key);

    writeChatDraftState(key, {
        ...current,
        draft: { ...current.draft, mentions: [...mentions] },
    });
}

export function addChatDraftAttachments(key: string, files: readonly File[]) {
    if (files.length === 0) {
        return;
    }

    const current = readChatDraftState(key);
    writeChatDraftState(key, {
        ...current,
        draft: {
            ...current.draft,
            attachments: [...current.draft.attachments, ...files.map(createComposerAttachment)],
        },
    });
}

export function removeChatDraftAttachment(key: string, nonce: string) {
    const current = readChatDraftState(key);
    const removed = current.draft.attachments.find((attachment) => attachment.nonce === nonce);

    if (!removed) {
        return;
    }

    revokeComposerAttachment(removed);
    writeChatDraftState(key, {
        ...current,
        draft: {
            ...current.draft,
            attachments: current.draft.attachments.filter(
                (attachment) => attachment.nonce !== nonce
            ),
        },
    });
}

/** Takes ownership of the current attachments until the send settles. */
export function takeChatDraftForSend(key: string): ChatDraftContents {
    const current = readChatDraftState(key);
    const submitted = copyDraftContents(current.draft);

    writeChatDraftState(key, { ...current, draft: emptyDraft });
    return submitted;
}

/** Returns an older failed send without replacing newer work. */
export function recoverFailedChatDraft(key: string, submitted: ChatDraftContents) {
    const current = readChatDraftState(key);
    if (isEmptyDraft(current.draft)) {
        writeChatDraftState(key, {
            draft: copyDraftContents(submitted),
            failed: current.failed,
        });
        return;
    }

    writeChatDraftState(key, {
        draft: current.draft,
        failed: [...current.failed, toFailedChatDraft(submitted)],
    });
}

/** Swaps a selected failed send into the editor, preserving the current draft in the queue. */
export function restoreFailedChatDraft(key: string, failedId: string) {
    const current = readChatDraftState(key);
    const failed = current.failed.find((draft) => draft.id === failedId);

    if (!failed) {
        return;
    }

    const remaining = current.failed.filter((draft) => draft.id !== failedId);
    const nextFailed = isEmptyDraft(current.draft)
        ? remaining
        : [...remaining, toFailedChatDraft(current.draft)];

    writeChatDraftState(key, {
        draft: copyDraftContents(failed),
        failed: nextFailed,
    });
}

export function discardFailedChatDraft(key: string, failedId: string) {
    const current = readChatDraftState(key);
    const failed = current.failed.find((draft) => draft.id === failedId);

    if (!failed) {
        return;
    }

    disposeChatDraftContents(failed);
    writeChatDraftState(key, {
        ...current,
        failed: current.failed.filter((draft) => draft.id !== failedId),
    });
}

export function disposeChatDraftContents(draft: ChatDraftContents) {
    for (const attachment of draft.attachments) {
        revokeComposerAttachment(attachment);
    }
}

export function resetChatDraftsForTest() {
    for (const state of drafts.values()) {
        disposeChatDraftContents(state.draft);
        for (const failed of state.failed) {
            disposeChatDraftContents(failed);
        }
    }

    const keys = [...drafts.keys()];
    drafts.clear();
    for (const key of keys) {
        emitChange(key);
    }
}

function copyDraftContents(draft: ChatDraftContents): ChatDraftContents {
    return {
        attachments: [...draft.attachments],
        content: draft.content,
        mentions: [...draft.mentions],
    };
}

function toFailedChatDraft(draft: ChatDraftContents): FailedChatDraft {
    return { ...copyDraftContents(draft), id: crypto.randomUUID() };
}

function isEmptyDraft(draft: ChatDraftContents) {
    return draft.content.length === 0 && draft.attachments.length === 0;
}

function writeChatDraftState(key: string, state: ChatDraftState) {
    if (isEmptyDraft(state.draft) && state.failed.length === 0) {
        drafts.delete(key);
    } else {
        drafts.set(key, state);
    }

    emitChange(key);
}

export function subscribeChatDraft(key: string, listener: () => void) {
    const keyListeners = listeners.get(key) ?? new Set<() => void>();
    keyListeners.add(listener);
    listeners.set(key, keyListeners);

    return () => {
        keyListeners.delete(listener);
        if (keyListeners.size === 0) {
            listeners.delete(key);
        }
    };
}

function emitChange(key: string) {
    for (const listener of listeners.get(key) ?? []) {
        listener();
    }
}
