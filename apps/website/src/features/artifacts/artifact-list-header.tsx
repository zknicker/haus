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
 * The list's column headers: Name over the file names, then Kind, Modified,
 * and Size over their columns (each shown once the library is wide enough
 * for it), and room for the ⋮ menu. Pressing a header sorts by it; pressing
 * the sorted one flips its direction, Finder's way.
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
                onPress={() => setArtifactLibrarySort(nextLibrarySort(sort, by))}
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
            >
                {label}
                {active ? (
                    <Icon
                        aria-hidden="true"
                        icon={sort.direction === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
                        size={14}
                    />
                ) : null}
            </Button>
        );
    };
    return (
        <fieldset className="artifact-list-header">
            <legend className="sr-only">Sort files</legend>
            <span className="artifact-list-header__name">{header('name')}</span>
            <span className="artifact-column artifact-column--kind">{header('kind')}</span>
            <span className="artifact-column artifact-column--modified">{header('modified')}</span>
            <span className="artifact-column artifact-column--size">{header('size')}</span>
            <span aria-hidden="true" className="artifact-column artifact-column--menu" />
        </fieldset>
    );
}
