/** A navigable step in the drive trail. */
export interface ArtifactsCrumb {
    href: string;
    label: string;
}

/** The trail as drawn: leading crumbs, the folded middle (empty when none), trailing crumbs. */
export interface CollapsedTrail {
    hidden: ArtifactsCrumb[];
    leading: ArtifactsCrumb[];
    trailing: ArtifactsCrumb[];
}

/**
 * Folds a deep trail's middle into one ellipsis menu, Finder-style: Files
 * first and the open folder's parent last always stay links, so the root and
 * one step up are each a click away. Folding starts only once it hides two or
 * more folders; hiding a single one would save nothing.
 */
export function collapseTrail(crumbs: readonly ArtifactsCrumb[]): CollapsedTrail {
    if (crumbs.length <= 3) {
        return { hidden: [], leading: [...crumbs], trailing: [] };
    }
    return {
        hidden: crumbs.slice(1, -1),
        leading: crumbs.slice(0, 1),
        trailing: crumbs.slice(-1),
    };
}
