import * as React from 'react';
import { normalizeMentions } from './mention-text.ts';
import type { Mention } from './mention-types.ts';
import { ReferenceChip } from './reference-chip.tsx';

export function renderMentionText({
    content,
    mentionClassName,
    mentions,
}: {
    content: string;
    mentionClassName?: string;
    mentions: readonly Mention[];
}) {
    return splitMentionText(content, mentions).map((fragment) =>
        fragment.type === 'mention' ? (
            <ReferenceChip
                className={mentionClassName}
                id={fragment.mention.id}
                key={`${fragment.mention.start}:${fragment.mention.end}`}
                kind={fragment.mention.kind}
                label={fragment.mention.label}
                metadata={fragment.mention.metadata}
            />
        ) : (
            <React.Fragment key={`${fragment.start}:${fragment.text}`}>
                {fragment.text}
            </React.Fragment>
        )
    );
}

export function splitMentionText(content: string, mentions: readonly Mention[]) {
    const normalized = normalizeMentions(content, mentions);
    const fragments: Array<
        { start: number; text: string; type: 'text' } | { mention: Mention; type: 'mention' }
    > = [];
    let cursor = 0;

    for (const mention of normalized) {
        if (mention.start > cursor) {
            fragments.push({
                start: cursor,
                text: content.slice(cursor, mention.start),
                type: 'text',
            });
        }

        fragments.push({ mention, type: 'mention' });
        cursor = mention.end;
    }

    if (cursor < content.length || fragments.length === 0) {
        fragments.push({
            start: cursor,
            text: content.slice(cursor),
            type: 'text',
        });
    }

    return fragments;
}
