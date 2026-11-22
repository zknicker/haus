import { ChatMessage } from '@heroui-pro/react';
import { TurnAvatar } from '../chats/agent-turn-avatar.tsx';
import { transcriptTurnGeometry } from '../chats/chat-transcript-turn-geometry.ts';
import { TurnHeader } from '../chats/chat-transcript-turn-header.tsx';
import { WorkerKeycap } from '../workers/cloud-agent-provider-mark.tsx';
import type { PreviewAuthor, PreviewBody, PreviewItem } from './asks-preview-state.ts';
import { authors, previewTime } from './asks-preview.fixture.ts';

export function PreviewTranscript({ items }: { items: readonly PreviewItem[] }) {
    return (
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col px-5 py-4">
            {items.map((item) =>
                item.kind === 'notice' ? (
                    <p className="text-muted px-5 py-2 text-center text-sm" key={item.id}>
                        {item.text}
                    </p>
                ) : (
                    <PreviewMessageRow
                        author={item.author}
                        body={item.body}
                        key={item.id}
                        minute={item.minute}
                    />
                )
            )}
        </div>
    );
}

function PreviewMessageRow({
    author,
    body,
    minute,
}: {
    author: PreviewAuthor;
    body: PreviewBody;
    minute: number;
}) {
    const { avatarUrl, name } = authors[author];
    return (
        <ChatMessage.Assistant className={transcriptTurnGeometry.row}>
            {author === 'worker' ? (
                <span className={transcriptTurnGeometry.avatar}>
                    <WorkerKeycap provider={null} size={32} />
                </span>
            ) : (
                <TurnAvatar avatarUrl={avatarUrl} name={name} />
            )}
            <ChatMessage.Body className={transcriptTurnGeometry.body}>
                <TurnHeader displayName={name} timestamp={previewTime(minute)} />
                <div className="text-foreground max-w-[46rem] min-w-0 text-base leading-6 break-words">
                    {body.kind === 'text' ? (
                        <p className="whitespace-pre-wrap">{body.text}</p>
                    ) : (
                        <ol className="flex list-decimal flex-col gap-1 pl-5">
                            {body.rows.map((row) => (
                                <li key={row.question}>
                                    <span className="font-semibold">{row.question}</span>
                                    <span className="text-muted"> → </span>
                                    {row.answer}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </ChatMessage.Body>
        </ChatMessage.Assistant>
    );
}
