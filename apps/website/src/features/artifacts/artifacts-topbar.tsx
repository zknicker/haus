import { Breadcrumbs } from '@heroui/react';
import type { ReactNode } from 'react';
import { inboxRoute } from '../servers/server-routes.ts';
import { RouteTabIcon } from '../shell/route-tab-presentation.tsx';
import { SectionHeader } from '../shell/section-header.tsx';

/** A navigable step in the drive trail. */
export interface ArtifactsCrumb {
    href: string;
    label: string;
}

/**
 * The Artifacts band: the section glyph and a drive trail
 * ("Haus › Artifacts › starter-kit › scripts"), in the Inbox's and
 * Activity's band shape, with the page's controls trailing. `crumbs` are the
 * navigable steps after Haus (Artifacts first); `current` is where you are,
 * unlinked: Artifacts itself at the root, else the open folder or file.
 */
export function ArtifactsTopbar({
    children,
    crumbs = [],
    current,
    slug,
}: {
    children?: ReactNode;
    crumbs?: readonly ArtifactsCrumb[];
    current: string;
    slug: string;
}) {
    return (
        <SectionHeader
            leading={
                <div className="flex min-w-0 shrink items-center gap-2">
                    <RouteTabIcon className="text-muted" size={16} tab="artifacts" />
                    <nav aria-label="Drive path" className="min-w-0">
                        <Breadcrumbs>
                            <Breadcrumbs.Item href={inboxRoute(slug)}>Haus</Breadcrumbs.Item>
                            {crumbs.map((crumb) => (
                                <Breadcrumbs.Item href={crumb.href} key={crumb.href}>
                                    {crumb.label}
                                </Breadcrumbs.Item>
                            ))}
                            <Breadcrumbs.Item>{current}</Breadcrumbs.Item>
                        </Breadcrumbs>
                    </nav>
                </div>
            }
        >
            {children}
        </SectionHeader>
    );
}
