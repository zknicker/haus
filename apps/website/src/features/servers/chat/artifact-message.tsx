import { type WidgetArtifactProps, widgetArtifactPropsSchema } from '@haus/api/widgets/artifact';
import { WidgetArtifactCard } from '../../chats/artifact-card.tsx';
import { ArtifactPanelOpenProvider } from '../../chats/artifact-panel-context.tsx';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import type { Mention, ReferenceActivation } from '../../mentions/mention-types.ts';

type ArtifactMessageSegment =
    | { key: string; kind: 'page'; props: WidgetArtifactProps }
    | { end: number; key: string; kind: 'text'; start: number; text: string };

export function ArtifactMessage({
    agentId,
    content,
    mentions,
    onOpenArtifact,
    onReferenceActivate,
}: {
    agentId: string;
    content: string;
    mentions?: readonly Mention[];
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
}) {
    const segments = splitArtifactFences(content);
    const pages = segments.filter((segment) => segment.kind === 'page');

    // In-chat cards sit below the message: prose reads as one block, then
    // each fence's card in authored order.
    return (
        <ArtifactPanelOpenProvider agentId={agentId} onOpen={onOpenArtifact}>
            <div className="flex min-w-0 flex-col gap-3">
                {segments.map((segment) =>
                    segment.kind === 'text' ? (
                        <ChatMarkdownText
                            content={segment.text}
                            key={segment.key}
                            mentions={sliceMentions(mentions, segment.start, segment.end)}
                            onReferenceActivate={onReferenceActivate}
                        />
                    ) : null
                )}
            </div>
            {pages.length > 0 ? (
                <div className="mt-1.5 flex min-w-0 flex-col gap-1.5">
                    {pages.map((segment) => (
                        <WidgetArtifactCard key={segment.key} props={segment.props} />
                    ))}
                </div>
            ) : null}
        </ArtifactPanelOpenProvider>
    );
}

/**
 * The `page` fence (a workspace HTML page; the old `artifact` fence is no
 * longer recognized) already reads mid-line — a model that glues the opener
 * to the end of a sentence still gets a card — and the terminator is now as
 * forgiving as the visual one: it closes whether it stands on its own line or
 * is glued to the end of the JSON. Text on either side stays message text.
 */
export function splitArtifactFences(content: string): ArtifactMessageSegment[] {
    const fence = /```page[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?[ \t]*```/gu;
    const segments: ArtifactMessageSegment[] = [];
    let cursor = 0;

    for (const match of content.matchAll(fence)) {
        const matchIndex = match.index;
        const parsed = parseArtifactProps(match[1] ?? '');
        if (!(parsed && matchIndex !== undefined)) {
            continue;
        }
        if (matchIndex > cursor) {
            segments.push({
                key: `text:${cursor}:${matchIndex}`,
                kind: 'text',
                end: matchIndex,
                start: cursor,
                text: content.slice(cursor, matchIndex),
            });
        }
        segments.push({
            key: `page:${matchIndex}:${match[0].length}`,
            kind: 'page',
            props: parsed,
        });
        cursor = matchIndex + match[0].length;
    }

    if (cursor < content.length || segments.length === 0) {
        segments.push({
            key: `text:${cursor}:${content.length}`,
            kind: 'text',
            end: content.length,
            start: cursor,
            text: content.slice(cursor),
        });
    }
    return segments;
}

function sliceMentions(mentions: readonly Mention[] | undefined, start: number, end: number) {
    return mentions
        ?.filter((mention) => mention.start >= start && mention.end <= end)
        .map((mention) => ({
            ...mention,
            end: mention.end - start,
            start: mention.start - start,
        }));
}

function parseArtifactProps(source: string) {
    try {
        return widgetArtifactPropsSchema.parse(JSON.parse(source));
    } catch {
        return null;
    }
}
