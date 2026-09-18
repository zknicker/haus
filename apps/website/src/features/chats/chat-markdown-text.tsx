import type { Mention, ReferenceActivation } from '../mentions/mention-types.ts';
import { ReferenceChip } from '../mentions/reference-chip.tsx';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { splitMentionText } from '../mentions/render-mention-text.tsx';
import { renderInlineMarkdown } from './chat-inline-markdown-renderer.tsx';
import type { ChatTextAnimationRange } from './chat-inline-text-animation.tsx';
import { type ChatMarkdownHeadingBlock, parseChatMarkdownBlocks } from './chat-markdown-blocks.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';

export function ChatMarkdownText({
    animatedRanges = [],
    content,
    mentions,
    onReferenceActivate,
}: {
    animatedRanges?: readonly ChatTextAnimationRange[];
    content: string;
    mentions?: readonly Mention[];
    onReferenceActivate?: ReferenceActivation;
}) {
    const renderContext = useTranscriptRenderContextOptional();
    const chatId = renderContext?.chatId;
    const serverId = renderContext?.turnDetails?.serverId;

    if (animatedRanges.length === 0) {
        return (
            <ReferenceMarkdown
                chatId={chatId}
                className="chat-markdown text-base"
                content={content}
                mentions={mentions}
                onReferenceActivate={onReferenceActivate}
                previewReferences
                serverId={serverId}
            />
        );
    }

    const blocks = parseChatMarkdownBlocks(content);

    return blocks.map((block) => {
        if (block.kind === 'heading') {
            return (
                <ChatMarkdownHeading
                    animatedRanges={animatedRanges}
                    block={block}
                    chatId={chatId}
                    key={`heading:${block.start}`}
                    mentions={mentions}
                    onReferenceActivate={onReferenceActivate}
                    serverId={serverId}
                />
            );
        }

        // A table has no inline-animated form: the streaming renderer paints
        // spans of text, and a row of cells is not text. Rendering it through
        // the settled path means the DOM a row arrives in is the DOM it keeps,
        // so the message never reflows when the animation window closes. The
        // block margins are part of that: streaming prose runs at `my-0` and
        // the scroller's own margin is scoped to the settled block layout, so
        // without them the table would sit flush against the text until settle
        // and then push it 12px apart.
        if (block.kind === 'table') {
            return (
                <ReferenceMarkdown
                    chatId={chatId}
                    className="chat-markdown my-3 text-base first:mt-0 last:mb-0"
                    content={block.text}
                    key={`table:${block.start}`}
                    mentions={sliceMentions(mentions, block.start, block.start + block.text.length)}
                    onReferenceActivate={onReferenceActivate}
                    previewReferences
                    serverId={serverId}
                />
            );
        }

        if (block.text.trim().length === 0) {
            return null;
        }

        return (
            <p
                className="my-0 whitespace-pre-wrap break-words text-base [overflow-wrap:anywhere]"
                key={`prose:${block.start}`}
            >
                {renderMarkdownInline({
                    animatedRanges,
                    chatId,
                    content: block.text,
                    keyPrefix: `prose:${block.start}`,
                    mentions: sliceMentions(mentions, block.start, block.start + block.text.length),
                    onReferenceActivate,
                    serverId,
                    sourceOffset: block.start,
                })}
            </p>
        );
    });
}

function renderMarkdownInline({
    animatedRanges,
    chatId,
    content,
    keyPrefix,
    mentions,
    onReferenceActivate,
    serverId,
    sourceOffset,
}: {
    animatedRanges: readonly ChatTextAnimationRange[];
    chatId?: string;
    content: string;
    keyPrefix: string;
    mentions?: readonly Mention[];
    onReferenceActivate?: ReferenceActivation;
    serverId?: string;
    sourceOffset: number;
}) {
    if (!mentions || mentions.length === 0) {
        return renderInlineMarkdown(content, keyPrefix, 0, {
            animatedRanges,
            sourceOffset,
        });
    }

    return splitMentionText(content, mentions).flatMap((fragment, index) => {
        if (fragment.type === 'mention') {
            return (
                <ReferenceChip
                    chatId={chatId}
                    id={fragment.mention.id}
                    key={`mention:${fragment.mention.start}:${fragment.mention.end}`}
                    kind={fragment.mention.kind}
                    label={fragment.mention.label}
                    metadata={fragment.mention.metadata}
                    onActivate={onReferenceActivate}
                    preview
                    serverId={serverId}
                />
            );
        }

        return renderInlineMarkdown(
            fragment.text,
            `${keyPrefix}:text:${fragment.start}:${index}`,
            0,
            {
                animatedRanges,
                sourceOffset: sourceOffset + fragment.start,
            }
        );
    });
}

function ChatMarkdownHeading({
    animatedRanges,
    block,
    chatId,
    mentions,
    onReferenceActivate,
    serverId,
}: {
    animatedRanges: readonly ChatTextAnimationRange[];
    block: ChatMarkdownHeadingBlock;
    chatId?: string;
    mentions?: readonly Mention[];
    onReferenceActivate?: ReferenceActivation;
    serverId?: string;
}) {
    const content = renderMarkdownInline({
        animatedRanges,
        chatId,
        content: block.text,
        keyPrefix: `heading:${block.start}`,
        mentions: sliceMentions(mentions, block.textStart, block.textStart + block.text.length),
        onReferenceActivate,
        serverId,
        sourceOffset: block.textStart,
    });

    if (block.depth === 1) {
        return (
            <h1 className="mt-4 mb-2 whitespace-normal break-words font-semibold text-xl leading-8 [overflow-wrap:anywhere] first:mt-0">
                {content}
            </h1>
        );
    }

    if (block.depth === 2) {
        return (
            <h2 className="mt-4 mb-1.5 whitespace-normal break-words font-semibold text-lg leading-7 [overflow-wrap:anywhere] first:mt-0">
                {content}
            </h2>
        );
    }

    return (
        <h3 className="mt-3 mb-1 whitespace-normal break-words font-semibold text-base leading-6 [overflow-wrap:anywhere] first:mt-0">
            {content}
        </h3>
    );
}

function sliceMentions(
    mentions: readonly Mention[] | undefined,
    start: number,
    end: number
): Mention[] | undefined {
    if (!mentions || mentions.length === 0) {
        return undefined;
    }

    return mentions
        .filter((mention) => mention.start >= start && mention.end <= end)
        .map((mention) => ({
            ...mention,
            end: mention.end - start,
            start: mention.start - start,
        }));
}
