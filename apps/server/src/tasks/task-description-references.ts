import type { TaskDetail } from '@haus/api';

import { readBareReferenceTokens } from '../chats/bare-reference-tokens.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { resolveTaskLinks } from './task-reference-links.ts';

type TaskDescriptionReferences = Pick<TaskDetail, 'descriptionContent' | 'descriptionTaskLinks'>;

/**
 * A Task description as clients render it, resolved when read (ADR 0051). The
 * bare `@handle`, `#channel`, and `#channel:shortid` tokens an Agent's Message
 * has rewritten into references when it is written are rewritten the same way
 * here, and the Task references in the result resolve like a Message's
 * `taskLinks`. Nothing is stored, so editing the description needs no
 * bookkeeping and `description` stays the source a reader edits.
 */
export async function readTaskDescriptionReferences(
    db: Pick<HausDatabase, 'select'>,
    input: { description: string; serverId: string }
): Promise<TaskDescriptionReferences> {
    const content =
        readBareReferenceTokens(input.description).length === 0
            ? input.description
            : await canonicalizeAgentMessageContentForPersistence(db, {
                  content: input.description,
                  serverId: input.serverId,
              });
    return {
        descriptionContent: content,
        descriptionTaskLinks: await resolveTaskLinks(db, { content, serverId: input.serverId }),
    };
}
