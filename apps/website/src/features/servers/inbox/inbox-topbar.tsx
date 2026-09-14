import { Breadcrumbs } from '@heroui/react';
import { RouteTabIcon } from '../../shell/route-tab-presentation.tsx';
import { SectionHeader } from '../../shell/section-header.tsx';
import { useServerContext } from '../server-context.ts';
import { inboxRoute } from '../server-routes.ts';

/**
 * The Inbox's band: where you are, and nothing else.
 *
 * It copies Settings' band exactly — the current page's 16px muted glyph
 * beside a `Breadcrumbs` trail — because that is the shape the rest of the
 * app already uses to say where you are. The glyph is the page's, never the
 * product's: Settings shows the open page's icon, so the Inbox shows the inbox
 * glyph. Every trail leads with the product, and the product crumb is a
 * destination — the Inbox, the app's front page — on every band, this one
 * included, so the two crumbs here are "Haus › Inbox". Settings' trail starts
 * from the same first crumb. The cluster rides `SectionHeader`'s leading slot
 * rather than its `title`, which would wrap the breadcrumb's own `nav` in an
 * `h1`.
 *
 * The band carries no trailing meta. The day was tried there and read as a
 * fact torn away from the greeting it belongs to; it stays beneath the
 * greeting in `InboxHeader`. A full-width search field was tried too and
 * dominated a page that is a briefing, not a search.
 */
export function InboxTopbar() {
    const { server } = useServerContext();

    return (
        <SectionHeader
            leading={
                <div className="flex min-w-0 shrink items-center gap-2">
                    <RouteTabIcon className="text-muted" size={16} tab="inbox" />
                    <Breadcrumbs className="min-w-0">
                        <Breadcrumbs.Item href={inboxRoute(server.slug)}>Haus</Breadcrumbs.Item>
                        <Breadcrumbs.Item>Inbox</Breadcrumbs.Item>
                    </Breadcrumbs>
                </div>
            }
        />
    );
}
