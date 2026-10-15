import { Breadcrumbs, Button, Dropdown, Label } from '@heroui/react';
import { breadcrumbsVariants } from '@heroui/styles';
import { ArrowRight01Icon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { inboxRoute } from '../servers/server-routes.ts';
import { type BandCrumb, collapseTrail, crumbKey } from './band-trail.ts';

/**
 * Where you are, as one trail that always starts at the product: "Haus" (the
 * Inbox, the app's front page), then the section, then each step down to the
 * current page, which is the unlinked last crumb. A deep trail folds its
 * middle into one ellipsis menu (`collapseTrail`).
 *
 * `children` are extra `Breadcrumbs.Item`s a host appends after `crumbs` when
 * a crumb's behavior lives in the host's own context (the Agent Workspace's
 * root and open-file crumbs); they are never folded.
 */
export function BandBreadcrumbs({
    children,
    crumbs,
    current,
}: {
    children?: ReactNode;
    /** The section first, then each step before the current page. */
    crumbs: readonly BandCrumb[];
    /** The current page; omitted when `children` end the trail. */
    current?: BandCrumb;
}) {
    const { slug = '' } = useParams();
    const trail = collapseTrail(crumbs);
    return (
        <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
            <Breadcrumbs separator={separator}>
                <Breadcrumbs.Item href={inboxRoute(slug)}>Haus</Breadcrumbs.Item>
                {trail.leading.map(linkedCrumb)}
                {trail.hidden.length > 0 ? <FoldedCrumbs crumbs={trail.hidden} /> : null}
                {trail.trailing.map(linkedCrumb)}
                {children}
                {current ? (
                    <Breadcrumbs.Item>
                        <CrumbLabel crumb={current} />
                    </Breadcrumbs.Item>
                ) : null}
            </Breadcrumbs>
        </nav>
    );
}

function linkedCrumb(crumb: BandCrumb) {
    return (
        <Breadcrumbs.Item href={crumb.href} key={crumbKey(crumb)} onPress={crumb.onPress}>
            <CrumbLabel crumb={crumb} />
        </Breadcrumbs.Item>
    );
}

/** A member or Agent leads with their face everywhere else in the app, so their crumb does too. */
function CrumbLabel({ crumb }: { crumb: BandCrumb }) {
    if (!crumb.mark) {
        return crumb.label;
    }
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            {crumb.mark}
            <span className="min-w-0 truncate">{crumb.label}</span>
        </span>
    );
}

const separatorClassName = breadcrumbsVariants().separator();

// One glyph for every separator, so the folded crumb can draw the same one.
const separator = <Icon icon={ArrowRight01Icon} />;

/** The folded middle of a deep trail: an ellipsis whose menu lists each hidden crumb, outermost first. */
function FoldedCrumbs({ crumbs }: { crumbs: readonly BandCrumb[] }) {
    return (
        <Breadcrumbs.Item>
            {() => (
                <>
                    <Dropdown>
                        <Button
                            aria-label="Show enclosing places"
                            isIconOnly
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom start">
                            <Dropdown.Menu aria-label="Enclosing places">
                                {crumbs.map((crumb) => (
                                    <Dropdown.Item
                                        href={crumb.href}
                                        id={crumbKey(crumb)}
                                        key={crumbKey(crumb)}
                                        onAction={crumb.onPress}
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
