import type { TranscriptSystemRow } from '../../../chats/transcript-contract.ts';

type ArtifactRow = Extract<TranscriptSystemRow, { systemKind: 'artifact' }>;

export function ArtifactLogEntry({ entry }: { entry: ArtifactRow }) {
    const label = getArtifactLabel(entry.artifact);

    return (
        <div className="card-shell flex items-center gap-2 border border-success-soft bg-success-soft px-3 py-1.5">
            <span className="font-medium text-success text-xs uppercase tracking-[0.16em]">
                {entry.artifact.artifactType}
            </span>
            <span className="min-w-0 truncate text-foreground/90 text-sm">{label}</span>
        </div>
    );
}

function getArtifactLabel(entry: ArtifactRow['artifact']) {
    const payload =
        entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
            ? (entry.payload as Record<string, unknown>)
            : {};
    const title = readString(payload.title);
    const contentRef = readString(payload.contentRef);
    const contentText = readString(payload.contentText);

    return title ?? entry.path ?? contentRef ?? contentText ?? 'Stored output';
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
