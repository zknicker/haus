import { Breadcrumbs, Button, Dropdown, Label } from '@heroui/react';
import { breadcrumbsVariants } from '@heroui/styles';
import { ArrowRight01Icon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { inboxRoute } from '../servers/server-routes.ts';
import { RouteTabIcon } from '../shell/route-tab-presentation.tsx';
import { useWorkspaceBandTabLabel } from '../shell/workspace-band-tab-label.ts';
import { type ArtifactsCrumb, collapseTrail } from './library-trail.ts';

export type { ArtifactsCrumb } from './library-trail.ts';

/**
 * The Files band: optional history buttons, the section glyph, and a folder
 * trail ("Haus › Files › starter-kit › scripts"), with the page's controls
 * trailing. `crumbs` are the navigable steps after Haus (Files first);
 * `current` is where you are, unlinked. A deep trail folds its middle into an
 * ellipsis menu. The trail is navigation, not the page's name, so it stays
 * beside a desktop tab too; only the glyph gives way to the tab's mark. The
 * row is the `files-band` container the controls size themselves against.
 */
export function ArtifactsTopbar({
    children,
    crumbs = [],
    current,
    history,
    slug,
}: {
    children?: ReactNode;
    crumbs?: readonly ArtifactsCrumb[];
    current: string;
    history?: ReactNode;
    slug: string;
}) {
    const inTab = useWorkspaceBandTabLabel() !== null;
    const trail = collapseTrail(crumbs);
    return (
        <div className="@container/files-band flex min-w-0 flex-1 items-center gap-3">
            {history}
            {inTab ? null : (
                <RouteTabIcon className="shrink-0 text-muted" size={16} tab="artifacts" />
            )}
            <nav aria-label="Folder path" className="min-w-0 overflow-hidden">
                <Breadcrumbs separator={separator}>
                    <Breadcrumbs.Item href={inboxRoute(slug)}>Haus</Breadcrumbs.Item>
                    {trail.leading.map((crumb) => (
                        <Breadcrumbs.Item href={crumb.href} key={crumb.href}>
                            {crumb.label}
                        </Breadcrumbs.Item>
                    ))}
                    {trail.hidden.length > 0 ? <FoldedCrumbs crumbs={trail.hidden} /> : null}
                    {trail.trailing.map((crumb) => (
                        <Breadcrumbs.Item href={crumb.href} key={crumb.href}>
                            {crumb.label}
                        </Breadcrumbs.Item>
                    ))}
                    <Breadcrumbs.Item>{current}</Breadcrumbs.Item>
                </Breadcrumbs>
            </nav>
            {children ? (
                <div className="ms-auto flex shrink-0 items-center gap-2">{children}</div>
            ) : null}
        </div>
    );
}

const separatorClassName = breadcrumbsVariants().separator();

// One glyph for every separator, so the folded crumb can draw the same one.
const separator = <Icon icon={ArrowRight01Icon} />;

/** The folded middle of a deep trail: an ellipsis whose menu lists each hidden folder, outermost first. */
function FoldedCrumbs({ crumbs }: { crumbs: readonly ArtifactsCrumb[] }) {
    return (
        <Breadcrumbs.Item>
            {() => (
                <>
                    <Dropdown>
                        <Button
                            aria-label="Show enclosing folders"
                            isIconOnly
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom start">
                            <Dropdown.Menu aria-label="Enclosing folders">
                                {crumbs.map((crumb) => (
                                    <Dropdown.Item
                                        href={crumb.href}
                                        id={crumb.href}
                                        key={crumb.href}
                                        textValue={crumb.label}
                                    >
                                        <Label>{crumb.label}</Label>
                                    </Dropdown.Item>
                                ))}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                    <Icon
                        className={separatorClassName}
                        data-slot="breadcrumbs-separator"
                        icon={ArrowRight01Icon}
                    />
                </>
            )}
        </Breadcrumbs.Item>
    );
}
