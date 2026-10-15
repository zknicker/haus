import type { ArtifactPublicLink, ArtifactRecord } from '@haus/api';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** One file as a library row or tile draws it. */
export interface ArtifactRow {
    artifact: ArtifactRecord;
    facts: ArtifactRowFacts;
    /** The file's public link, from its library page. */
    publicLink: ArtifactPublicLink | null;
}

/** The words around a file's name, resolved by the caller. */
export interface ArtifactRowFacts {
    /** Who published the current revision: "You", an Agent, or a person. */
    author: string;
    /** A search hit's folder relative to the searched one, and where it opens. */
    folder: { href: string; label: string; onOpen: () => void } | null;
    kind: string;
    time: string;
    /** The title, when it differs from the file name. */
    title: string | null;
}

/**
 * "[title · ][folder · ]author · kind · time". A search hit's folder is a link
 * to that folder. With `columns`, a wide list shows kind and time in their own
 * columns, so the line drops them once the library is wide enough for those.
 */
export function ArtifactRowMeta({
    columns = false,
    facts,
}: {
    columns?: boolean;
    facts: ArtifactRowFacts;
}) {
    const lead: { key: string; part: ReactNode }[] = [
        facts.title === null ? null : { key: 'title', part: facts.title },
        facts.folder ? { key: 'folder', part: <FolderLink folder={facts.folder} /> } : null,
        { key: 'author', part: facts.author },
    ].filter((entry) => entry !== null);
    const tail = [facts.kind, facts.time];
    return (
        <>
            {lead.map(({ key, part }, index) => (
                <Fragment key={key}>
                    {index > 0 ? ' · ' : null}
                    {part}
                </Fragment>
            ))}
            <span className={columns ? '@2xl:hidden' : undefined}>
                {tail.map((part) => ` · ${part}`).join('')}
            </span>
        </>
    );
}

/** The link keeps its own press: the row around it selects and opens on press. */
function FolderLink({ folder }: { folder: NonNullable<ArtifactRowFacts['folder']> }) {
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    return (
        <Link
            className="text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={(event) => {
                stop(event);
                folder.onOpen();
            }}
            onKeyDown={stop}
            onPointerDown={stop}
            onPointerUp={stop}
            title={`Show in ${folder.label}`}
            to={folder.href}
        >
            {folder.label}
        </Link>
    );
}
