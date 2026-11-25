import { type ArtifactRecord, artifactTextMaxBytes } from '@haus/api';
import { FileTextPreview, type FileTextRenderer } from '../chats/file-text-preview.tsx';
import { ArtifactFileCard } from './artifact-file-card.tsx';
import { ArtifactTextConflict } from './artifact-text-conflict.tsx';
import { MarkdownDocument } from './markdown/markdown-document.tsx';
import type { ArtifactTextSession } from './use-artifact-text-session.ts';

export type ArtifactDocumentMode = 'rendered' | 'source';

export function ArtifactDocument({
    artifact,
    autoFocus = false,
    mode,
    renderer,
    serverId,
    session,
}: {
    artifact: ArtifactRecord;
    autoFocus?: boolean;
    mode: ArtifactDocumentMode;
    renderer: FileTextRenderer;
    serverId: string;
    session: ArtifactTextSession;
}) {
    const result = session.read.data;
    if (artifact.size_bytes > artifactTextMaxBytes || result?.status === 'too_large') {
        return (
            <ArtifactFileCard
                artifact={artifact}
                note="Too large to preview."
                serverId={serverId}
            />
        );
    }
    if (session.read.error || result?.status === 'binary') {
        return <ArtifactFileCard artifact={artifact} serverId={serverId} />;
    }
    const { original, text } = session;
    if (text === null || original === null) {
        return <section aria-busy="true" aria-label="File" className="artifact-document" />;
    }
    const framed = mode === 'rendered' && renderer !== 'markdown';
    return (
        <section
            aria-label="File preview"
            className={framed ? 'artifact-document artifact-document--wide' : 'artifact-document'}
        >
            {session.refusal ? (
                <div className="mb-6">
                    <ArtifactTextConflict
                        current={session.refusal.current}
                        message={session.refusal.message}
                        serverId={serverId}
                        text={text}
                    />
                </div>
            ) : null}
            {mode === 'source' ? (
                <textarea
                    aria-label={`Source of ${artifact.filename}`}
                    autoFocus={autoFocus && !session.readOnly}
                    className="artifact-document__source"
                    onChange={(event) => session.edit(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.currentTarget.blur();
                        }
                    }}
                    readOnly={session.readOnly}
                    spellCheck={false}
                    value={text}
                />
            ) : renderer === 'markdown' ? (
                <MarkdownDocument
                    autoFocus={autoFocus && !session.readOnly}
                    key={session.generation}
                    label={artifact.filename}
                    onChange={session.edit}
                    original={original}
                    readOnly={session.readOnly}
                    text={text}
                />
            ) : (
                <div className="artifact-document__frame">
                    <FileTextPreview
                        content={text}
                        path={artifact.filename}
                        quoteSource={{ href: artifact.version_url, label: artifact.filename }}
                        renderer={renderer}
                    />
                </div>
            )}
        </section>
    );
}
