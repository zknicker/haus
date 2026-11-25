import { Breadcrumbs } from '@heroui/react';
import type { ReactNode } from 'react';
import type { BandCrumbDrop } from '../shell/band-trail.ts';
import { CrumbDropTarget } from '../shell/crumb-drop-target.tsx';

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
    return (
        <div className="artifact-path-row">
            <span aria-hidden="true" className="flex shrink-0">
                {glyph}
            </span>
            <Breadcrumbs aria-label="File path" className="min-w-0 shrink">
                {crumbs.map((crumb) => (
                    <Breadcrumbs.Item href={crumb.href} key={crumb.href}>
                        {crumb.drop ? (
                            <CrumbDropTarget drop={crumb.drop}>{crumb.label}</CrumbDropTarget>
                        ) : (
                            crumb.label
                        )}
                    </Breadcrumbs.Item>
                ))}
                <Breadcrumbs.Item>{current}</Breadcrumbs.Item>
            </Breadcrumbs>
            {status ? <span className="text-muted shrink-0 truncate text-sm">{status}</span> : null}
            {children ? (
                <div className="ms-auto flex shrink-0 items-center gap-0.5">{children}</div>
            ) : null}
        </div>
    );
}
