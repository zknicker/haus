import type { ArtifactCreator } from '@haus/api';
import { SearchField } from '@heroui/react';
import type { ReactNode } from 'react';
import { ArtifactFilterMenu, activeFilterCount } from './artifact-filter-menu.tsx';
import { ArtifactLayoutToggle } from './artifact-layout-toggle.tsx';
import { ArtifactSortMenu } from './artifact-sort-menu.tsx';
import { useArtifactLibraryLayout } from './library-layout.ts';
import type { ArtifactKindFilter } from './library-params.ts';

/**
 * The library's controls: search (on the band only), one Filter button (File
 * type and Created by), Sort in the grid (the list sorts by its column
 * headers), list or grid, then Upload. On the band (the Drive root and its
 * shelves) they trail the drive trail; inside an area they sit on the open
 * folder's path row, and the area's tree filter is its search. A folder with
 * nothing in it and no filter set shows Upload alone, if that. On the band,
 * when it is too narrow, the layout switch and Sort fold into the Filter menu.
 */
export function ArtifactLibraryControls({
    creator,
    fileFilters,
    kind,
    onClearFilters,
    onCreatorChange,
    onKindChange,
    placement,
    search,
    serverId,
    showView,
    uploadMenu,
}: {
    creator: ArtifactCreator | null;
    /** Whether the controls offer the file-type and Created by filters. */
    fileFilters: boolean;
    kind: ArtifactKindFilter;
    /** Resets File type and Created by in one URL change. */
    onClearFilters: () => void;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    onKindChange: (kind: ArtifactKindFilter) => void;
    placement: 'band' | 'row';
    search: { label: string; onChange: (value: string) => void; value: string } | null;
    serverId: string;
    /** False on an empty, unfiltered folder: Filter and the layout have nothing to act on. */
    showView: boolean;
    uploadMenu: ReactNode;
}) {
    const layout = useArtifactLibraryLayout();
    const filter = {
        creator,
        fileFilters,
        kind,
        onClearFilters,
        onCreatorChange,
        onKindChange,
        serverId,
    };
    const filtering = fileFilters || activeFilterCount(kind, creator) > 0;
    const view = showView ? (
        <>
            {filtering ? <ArtifactFilterMenu {...filter} folded={false} /> : null}
            {layout === 'grid' ? <ArtifactSortMenu /> : null}
            <ArtifactLayoutToggle />
        </>
    ) : null;
    return (
        <>
            {search ? (
                <SearchField
                    aria-label={search.label}
                    className="w-36 shrink-0 @min-[40rem]/band:w-44"
                    onChange={search.onChange}
                    value={search.value}
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Search" />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
            ) : null}
            {placement === 'row' ? (
                view
            ) : (
                <>
                    <span className="hidden @min-[48rem]/band:contents">{view}</span>
                    {showView ? (
                        <span className="contents @min-[48rem]/band:hidden">
                            <ArtifactFilterMenu {...filter} folded />
                        </span>
                    ) : null}
                </>
            )}
            {uploadMenu}
        </>
    );
}
