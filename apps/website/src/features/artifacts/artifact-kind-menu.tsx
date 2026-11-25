import { Dropdown, Label } from '@heroui/react';
import { type ArtifactKindFilter, artifactKindFilters } from './library-params.ts';

export const kindTitles: Record<ArtifactKindFilter, string> = {
    all: 'All types',
    documents: 'Documents',
    images: 'Images',
    media: 'Media',
    other: 'Other',
};

interface KindFilterProps {
    kind: ArtifactKindFilter;
    onKindChange: (kind: ArtifactKindFilter) => void;
}

/** The file-type choices, the Filter menu's File type submenu. */
export function ArtifactKindOptions({ kind, onKindChange }: KindFilterProps) {
    return (
        <Dropdown.Menu
            aria-label="File type"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const next = artifactKindFilters.find((entry) => keys !== 'all' && keys.has(entry));
                if (next) {
                    onKindChange(next);
                }
            }}
            selectedKeys={new Set([kind])}
            selectionMode="single"
        >
            {artifactKindFilters.map((entry) => (
                <Dropdown.Item id={entry} key={entry} textValue={kindTitles[entry]}>
                    <Label>{kindTitles[entry]}</Label>
                    <Dropdown.ItemIndicator />
                </Dropdown.Item>
            ))}
        </Dropdown.Menu>
    );
}
