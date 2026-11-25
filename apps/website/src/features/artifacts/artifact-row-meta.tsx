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

/** A grid tile's meta line: "[title · ][folder · ]author · kind · time". A search hit's folder links there. */
export function ArtifactRowMeta({ facts }: { facts: ArtifactRowFacts }) {
    const parts: { key: string; part: ReactNode }[] = [
        facts.title === null ? null : { key: 'title', part: facts.title },
        facts.folder ? { key: 'folder', part: <FolderLink folder={facts.folder} /> } : null,
        { key: 'author', part: facts.author },
        { key: 'kind', part: facts.kind },
        { key: 'time', part: facts.time },
    ].filter((entry) => entry !== null);
    return (
        <>
            {parts.map(({ key, part }, index) => (
                <Fragment key={key}>
                    {index > 0 ? ' · ' : null}
                    {part}
                </Fragment>
            ))}
        </>
    );
}

/**
 * The muted words after a list row's name, on the same line: what no column
 * shows (a title that differs from the name, a search hit's folder link),
 * then the facts whose columns the library is too narrow to show yet.
 * Narrow-only parts trail, so the theme's " · " joins stay right.
 */
export function ArtifactRowAside({
    lead,
    narrow,
}: {
    lead: readonly { key: string; part: ReactNode }[];
    /** Parts that drop once their column appears: `detail` at 42rem, `modified` at 36rem. */
    narrow: readonly { column: 'detail' | 'modified'; key: string; part: ReactNode }[];
}) {
    return (
        <span className="artifact-row-aside">
            {lead.map(({ key, part }) => (
                <span className="artifact-row-aside__part" key={key}>
                    {part}
                </span>
            ))}
            {narrow.map(({ column, key, part }) => (
                <span
                    className={`artifact-row-aside__part artifact-row-aside__part--${column}`}
                    key={key}
                >
                    {part}
                </span>
            ))}
        </span>
    );
}

/** A file row's aside: title and search folder always, author and time while narrow. */
export function FileRowAside({ facts }: { facts: ArtifactRowFacts }) {
    return (
        <ArtifactRowAside
            lead={[
                facts.title === null ? null : { key: 'title', part: facts.title },
                facts.folder ? { key: 'folder', part: <FolderLink folder={facts.folder} /> } : null,
            ].filter((entry) => entry !== null)}
            narrow={[
                { column: 'detail', key: 'author', part: facts.author },
                { column: 'modified', key: 'time', part: facts.time },
            ]}
        />
    );
}

/** The link keeps its own press: the row around it selects and opens on press. */
function FolderLink({ folder }: { folder: NonNullable<ArtifactRowFacts['folder']> }) {
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    return (
        <Link
            className="text-muted hover:text-foreground underline decoration-dotted underline-offset-2"
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
