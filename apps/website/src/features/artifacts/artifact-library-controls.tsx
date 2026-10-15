import type { ArtifactCreator } from '@haus/api';
import { SearchField } from '@heroui/react';
import type { ReactNode } from 'react';
import { ArtifactCreatorMenu } from './artifact-creator-menu.tsx';
import { ArtifactFilterMenu } from './artifact-filter-menu.tsx';
import { ArtifactKindMenu } from './artifact-kind-menu.tsx';
import { ArtifactLayoutToggle } from './artifact-layout-toggle.tsx';
import { ArtifactSortMenu } from './artifact-sort-menu.tsx';
import type { ArtifactKindFilter } from './library-params.ts';

/**
 * The library's band controls: search, the file-type and Created by menus,
 * sort, list or grid, then Upload. They trail the drive trail in the shell band, so
 * the page below is all content. Search keeps a fixed width and a short
 * placeholder, so it never squeezes or clips; when the band (the `files-band`
 * container) is too narrow for every control, the menus and the layout switch
 * fold into one Filters menu instead. Search covers the open folder and every
 * folder under it.
 */
export function ArtifactLibraryControls({
    creator,
    folderName,
    kind,
    onCreatorChange,
    onKindChange,
    onSearchChange,
    search,
    serverId,
    uploadMenu,
}: {
    creator: ArtifactCreator | null;
    /** The open folder's name; null at the drive root. */
    folderName: string | null;
    kind: ArtifactKindFilter;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    onKindChange: (kind: ArtifactKindFilter) => void;
    onSearchChange: (value: string) => void;
    search: string;
    serverId: string;
    uploadMenu: ReactNode;
}) {
    return (
        <>
            <SearchField
                aria-label={folderName ? `Search in ${folderName}` : 'Search files'}
                className="@min-[40rem]/files-band:w-44 w-36 shrink-0"
                onChange={onSearchChange}
                value={search}
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search" />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
            <span className="@min-[58rem]/files-band:contents hidden">
                <ArtifactKindMenu kind={kind} onKindChange={onKindChange} />
                <ArtifactCreatorMenu
                    creator={creator}
                    onCreatorChange={onCreatorChange}
                    serverId={serverId}
                />
                <ArtifactSortMenu />
                <ArtifactLayoutToggle />
            </span>
            <span className="contents @min-[58rem]/files-band:hidden">
                <ArtifactFilterMenu
                    creator={creator}
                    kind={kind}
                    onCreatorChange={onCreatorChange}
                    onKindChange={onKindChange}
                    serverId={serverId}
                />
            </span>
            {uploadMenu}
        </>
    );
}
