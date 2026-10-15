import type { ReactNode } from 'react';

/**
 * One step of a page band's trail after the leading "Haus" crumb. A crumb is
 * a destination when it has an `href` or `onPress`; the trail's last crumb is
 * where you are and never links, whatever it carries.
 */
export interface BandCrumb {
    /** The crumb takes drops from its page (Files moves dragged items into a folder crumb). */
    drop?: BandCrumbDrop;
    href?: string;
    /** Plain text: a folded crumb lists it in a menu, and it is the tooltip-free name. */
    label: string;
    /** A record's face (an Agent, a member) drawn before the label; never folded. */
    mark?: ReactNode;
    onPress?: () => void;
}

/** How a crumb takes a drag: whether the drag in progress may land on it, and the landing. */
export interface BandCrumbDrop {
    /** Checked on every dragover with the drag's types; false leaves the drop refused. */
    accepts: (types: readonly string[]) => boolean;
    onDrop: () => void;
}

/** The trail as drawn: leading crumbs, the folded middle (empty when none), trailing crumbs. */
export interface CollapsedTrail {
    hidden: BandCrumb[];
    leading: BandCrumb[];
    trailing: BandCrumb[];
}

/**
 * Folds a deep trail's middle into one ellipsis menu, Finder-style: the
 * section (first) and the current page's parent (last) always stay links, so
 * the root and one step up are each a click away. Folding starts only once it
 * hides two or more crumbs; hiding a single one would save nothing. `crumbs`
 * are the navigable steps before the current page.
 */
export function collapseTrail(crumbs: readonly BandCrumb[]): CollapsedTrail {
    if (crumbs.length <= 3) {
        return { hidden: [], leading: [...crumbs], trailing: [] };
    }
    return {
        hidden: crumbs.slice(1, -1),
        leading: crumbs.slice(0, 1),
        trailing: crumbs.slice(-1),
    };
}

/** A stable React key for a crumb: its destination, else its label. */
export function crumbKey(crumb: BandCrumb): string {
    return crumb.href ?? crumb.label;
}
