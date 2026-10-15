import { Button, Dropdown, Header, Label, Separator } from '@heroui/react';
import { ArrowDown01Icon, ArrowUp01Icon, Sorting01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type LibrarySortDirection,
    librarySortKeys,
    setArtifactLibrarySort,
    useArtifactLibrarySort,
} from './library-sort.ts';

/** The band's sort menu: what files sort by, and which way. */
export function ArtifactSortMenu() {
    const sort = useArtifactLibrarySort();
    const label = librarySortKeys.find((entry) => entry.id === sort.by)?.label ?? 'Modified';
    return (
        <Dropdown>
            <Button aria-label={`Sort by ${label}`} isIconOnly size="sm" variant="ghost">
                <Icon icon={Sorting01Icon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <ArtifactSortOptions />
            </Dropdown.Popover>
        </Dropdown>
    );
}

const directions: readonly {
    icon: typeof ArrowUp01Icon;
    id: LibrarySortDirection;
    label: string;
}[] = [
    { icon: ArrowUp01Icon, id: 'asc', label: 'Ascending' },
    { icon: ArrowDown01Icon, id: 'desc', label: 'Descending' },
];

/** The sort choices, shared by the band's menu and the compact Filters submenu. */
export function ArtifactSortOptions() {
    const sort = useArtifactLibrarySort();
    return (
        <Dropdown.Menu aria-label="Sort">
            <Dropdown.Section
                disallowEmptySelection
                onSelectionChange={(keys) => {
                    const next = librarySortKeys.find(
                        (entry) => keys !== 'all' && keys.has(entry.id)
                    );
                    if (next) {
                        setArtifactLibrarySort({ ...sort, by: next.id });
                    }
                }}
                selectedKeys={new Set([sort.by])}
                selectionMode="single"
            >
                <Header>Sort by</Header>
                {librarySortKeys.map((entry) => (
                    <Dropdown.Item id={entry.id} key={entry.id} textValue={entry.label}>
                        <Label>{entry.label}</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                ))}
            </Dropdown.Section>
            <Separator />
            <Dropdown.Section
                disallowEmptySelection
                onSelectionChange={(keys) => {
                    const next = directions.find((entry) => keys !== 'all' && keys.has(entry.id));
                    if (next) {
                        setArtifactLibrarySort({ ...sort, direction: next.id });
                    }
                }}
                selectedKeys={new Set([sort.direction])}
                selectionMode="single"
            >
                <Header>Order</Header>
                {directions.map((entry) => (
                    <Dropdown.Item id={entry.id} key={entry.id} textValue={entry.label}>
                        <Icon aria-hidden="true" icon={entry.icon} size={16} />
                        <Label>{entry.label}</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                ))}
            </Dropdown.Section>
        </Dropdown.Menu>
    );
}
