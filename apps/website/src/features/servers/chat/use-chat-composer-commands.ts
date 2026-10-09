import type { Agent } from '@haus/api';
import { useChatComposerFocusRequest } from '../../../commands/chat-composer-focus.ts';
import {
    appendComposerInsert,
    useChatComposerInsertRequest,
} from '../../../commands/chat-composer-insert.ts';
import { useChatComposerMentionRequest } from '../../../commands/chat-composer-mention.ts';
import { useViewShown, useViewShownChange } from '../../../hooks/desktop-tabs/view-shown.ts';
import { buildAgentMentionOption } from '../../mentions/mention-options.ts';
import type { MentionOption } from '../../mentions/mention-types.ts';

/**
 * The App-wide commands a chat composer answers (focus, quote insert, Agent
 * mention). A chat view kept mounted while hidden (`KeptChatViews`) keeps its
 * composer alive, so only the shown one answers, and a reveal focuses it as a
 * freshly mounted editor's autofocus would. Thread composers answer none.
 */
export function useChatComposerCommands({
    agents,
    chatId,
    focusTextEditor,
    insertMention,
    thread,
    updateContent,
}: {
    agents: readonly Agent[];
    chatId: string | undefined;
    focusTextEditor: () => void;
    insertMention: (option: MentionOption) => void;
    thread: boolean;
    updateContent: (update: (current: string) => string) => void;
}) {
    const viewShown = useViewShown();
    useViewShownChange((shown) => {
        if (shown && !thread) {
            requestAnimationFrame(focusTextEditor);
        }
    });
    useChatComposerFocusRequest(!thread, () => {
        if (viewShown.isShown()) {
            focusTextEditor();
        }
    });
    useChatComposerInsertRequest(!thread, (text) => {
        if (!viewShown.isShown()) {
            return;
        }
        updateContent((current) => appendComposerInsert(current, text));
        requestAnimationFrame(focusTextEditor);
    });
    useChatComposerMentionRequest(thread ? null : (chatId ?? null), ({ agentId }) => {
        const agent = agents.find((candidate) => candidate.id === agentId);
        if (!(agent && viewShown.isShown())) {
            return;
        }
        insertMention(
            buildAgentMentionOption({
                agentId,
                agents: [{ id: agent.id, name: agent.displayName }],
            })
        );
    });
}
