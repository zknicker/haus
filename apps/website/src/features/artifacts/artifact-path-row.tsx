import { Breadcrumbs } from '@heroui/react';
import type { ReactNode } from 'react';
import { FoldedCrumbs, bandCrumbSeparator, linkedCrumb } from '../shell/band-breadcrumbs.tsx';
import { type BandCrumbDrop, collapseTrail } from '../shell/band-trail.ts';

export interface ArtifactPathCrumb {
    drop?: BandCrumbDrop;
    href: string;
    label: string;
    path: string;
}

export function ArtifactPathRow({
    children,
    crumbs,
    current,
    glyph,
    status,
}: {
    children?: ReactNode;
    crumbs: readonly ArtifactPathCrumb[];
    current: string;
    glyph: ReactNode;
    status?: ReactNode;
}) {
    const trail = collapseTrail(crumbs);
    return (
        <div className="artifact-path-row">
            <span aria-hidden="true" className="flex shrink-0">
                {glyph}
            </span>
            <Breadcrumbs
                aria-label="File path"
                className="min-w-0 shrink"
                separator={bandCrumbSeparator}
            >
                {trail.leading.map(linkedCrumb)}
                {trail.hidden.length > 0 ? <FoldedCrumbs crumbs={trail.hidden} /> : null}
                {trail.trailing.map(linkedCrumb)}
                <Breadcrumbs.Item>{current}</Breadcrumbs.Item>
            </Breadcrumbs>
            {status ? <span className="text-muted shrink-0 truncate text-sm">{status}</span> : null}
            {children ? (
                <div className="ms-auto flex shrink-0 items-center gap-0.5">{children}</div>
            ) : null}
        </div>
    );
}
