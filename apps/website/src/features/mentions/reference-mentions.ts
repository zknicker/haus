import type { Agent, Chat, TaskLink } from '@haus/api';

import type { HumanDirectory } from '../servers/human-identity.ts';
import {
    applyAgentMentionAppearance,
    applyChatMentionAppearance,
    applyHumanMentionAppearance,
    readMentionsFromMarkdown,
} from './mention-metadata.ts';
import type { Mention } from './mention-types.ts';
import { applyTaskLinks } from './task-reference-scan.ts';

/** The Server directory a rendered reference reads its live name, face, and color from. */
export interface ReferenceDirectory {
    agentsById: ReadonlyMap<string, Pick<Agent, 'avatarUrl' | 'displayName'>>;
    chatsById: ReadonlyMap<string, Pick<Chat, 'color' | 'icon'>>;
    humans: HumanDirectory;
}

/**
 * The chips a stored text renders: its rich references, wearing the directory's
 * current appearance, and the Task references the Server resolved for it. A
 * Message renders its content and `taskLinks` through this, and a Task
 * description its `descriptionContent` and `descriptionTaskLinks`, so the two
 * read the same.
 */
export function readReferenceMentions(
    content: string,
    taskLinks: readonly TaskLink[] | undefined,
    { agentsById, chatsById, humans }: ReferenceDirectory
): readonly Mention[] {
    return applyTaskLinks(
        applyHumanMentionAppearance(
            applyChatMentionAppearance(
                applyAgentMentionAppearance(readMentionsFromMarkdown(content), (agentId) => {
                    const agent = agentId ? agentsById.get(agentId) : undefined;
                    return {
                        avatarUrl: agent?.avatarUrl ?? null,
                        displayName: agent?.displayName ?? null,
                        primaryColor: null,
                    };
                }),
                (chatId) => {
                    const chat = chatId ? chatsById.get(chatId) : undefined;
                    return { color: chat?.color ?? null, icon: chat?.icon ?? null };
                }
            ),
            (userId) => ({
                avatarUrl: humans.avatarUrl(userId ?? null),
                displayName: humans.member(userId ?? null) ? humans.name(userId ?? null) : null,
            })
        ),
        content,
        taskLinks
    );
}
