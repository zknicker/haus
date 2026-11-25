import { Button } from '@heroui/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type LibrarySortKey,
    librarySortKeys,
    nextLibrarySort,
    setArtifactLibrarySort,
    useArtifactLibrarySort,
} from './library-sort.ts';

/**
 * The list's column headers over the rows' column boxes: Name, then the
 * detail column, Modified, and Size (each shown once the library is wide
 * enough for it), and room for the ⋮ menu. The detail column reads Files
 * while the list holds only folders and Updated by once it holds files; the
 * theme picks the label from the rows below, so the header must stay the
 * list's sibling. Pressing a header sorts by it; pressing the sorted one
 * flips its direction, Finder's way.
 */
export function ArtifactListHeader() {
    const sort = useArtifactLibrarySort();
    const header = (by: LibrarySortKey) => {
        const label = librarySortKeys.find((entry) => entry.id === by)?.label ?? by;
        const active = sort.by === by;
        const direction = sort.direction === 'asc' ? 'ascending' : 'descending';
        return (
            <Button
                aria-label={active ? `${label}, sorted ${direction}` : `Sort by ${label}`}
                data-active={active || undefined}
                onPress={() => setArtifactLibrarySort(nextLibrarySort(sort, by))}
                size="sm"
                variant="ghost"
            >
                {label}
                {active ? (
                    <Icon
                        aria-hidden="true"
                        icon={sort.direction === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
                        size={12}
                    />
                ) : null}
            </Button>
        );
    };
    return (
        <fieldset className="artifact-list-header">
            <legend className="sr-only">Sort files</legend>
            <span className="artifact-list-header__name">{header('name')}</span>
            <span className="artifact-column artifact-column--detail">
                <span className="artifact-column__files">Files</span>
                <span className="artifact-column__author">Updated by</span>
            </span>
            <span className="artifact-column artifact-column--modified">{header('modified')}</span>
            <span className="artifact-column artifact-column--size">{header('size')}</span>
            <span aria-hidden="true" className="artifact-column artifact-column--menu" />
        </fieldset>
    );
}
