import { Breadcrumbs } from '@heroui/react';
import type { ReactNode } from 'react';
import { inboxRoute, serverRoute } from '../servers/server-routes.ts';
import { RouteTabIcon } from '../shell/route-tab-presentation.tsx';
import { SectionHeader } from '../shell/section-header.tsx';

/**
 * The Artifacts band: the section glyph and a "Haus › Artifacts" trail, in the
 * Inbox's and Activity's band shape, with the page's controls trailing. A
 * folder or an open file adds itself as the last crumb, and the Artifacts
 * crumb becomes the way back to the whole library (`libraryHref`, which may
 * keep the open kind filter).
 */
export function ArtifactsTopbar({
    children,
    current,
    libraryHref,
    slug,
}: {
    children?: ReactNode;
    current?: string;
    libraryHref?: string;
    slug: string;
}) {
    return (
        <SectionHeader
            leading={
                <div className="flex min-w-0 shrink items-center gap-2">
                    <RouteTabIcon className="text-muted" size={16} tab="artifacts" />
                    <Breadcrumbs className="min-w-0">
                        <Breadcrumbs.Item href={inboxRoute(slug)}>Haus</Breadcrumbs.Item>
                        {current === undefined ? (
                            <Breadcrumbs.Item>Artifacts</Breadcrumbs.Item>
                        ) : (
                            <>
                                <Breadcrumbs.Item
                                    href={libraryHref ?? `${serverRoute(slug)}/artifacts`}
                                >
                                    Artifacts
                                </Breadcrumbs.Item>
                                <Breadcrumbs.Item>{current}</Breadcrumbs.Item>
                            </>
                        )}
                    </Breadcrumbs>
                </div>
            }
        >
            {children}
        </SectionHeader>
    );
}
