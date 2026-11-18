import { Button, Popover, SearchField } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';

export interface PickerPopoverItem {
    id: string;
    name: string;
}

/**
 * "Add provider"-style dropdown: a small trigger button opening a searchable
 * list of plain names. Picking an item adds it and closes the popover.
 */
export function PickerPopover<Item extends PickerPopoverItem>({
    emptyText,
    isPending,
    items,
    label,
    onAdd,
    searchPlaceholder,
    triggerVariant = 'secondary',
}: {
    emptyText: string;
    isPending: boolean;
    items: Item[];
    label: string;
    onAdd: (item: Item) => void;
    searchPlaceholder: string;
    triggerVariant?: 'ghost' | 'secondary';
}) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');

    React.useEffect(() => {
        if (open) {
            setQuery('');
        }
    }, [open]);

    const normalizedQuery = query.trim().toLowerCase();
    const visibleItems = normalizedQuery
        ? items.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
        : items;

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Button size="sm" type="button" variant={triggerVariant}>
                <Icon aria-hidden="true" icon={Add01Icon} />
                {label}
            </Button>
            <Popover.Content offset={8} placement="bottom end">
                <Popover.Dialog>
                    <div className="w-[min(19rem,calc(100vw-2rem))] p-2">
                        {items.length === 0 ? (
                            <p className="text-muted py-6 text-center text-sm">{emptyText}</p>
                        ) : (
                            <>
                                <div className="bg-overlay sticky top-0 z-10 pb-2">
                                    <SearchField
                                        aria-label={searchPlaceholder}
                                        fullWidth
                                        name="picker-search"
                                        onChange={setQuery}
                                        value={query}
                                        variant="secondary"
                                    >
                                        <SearchField.Group>
                                            <SearchField.SearchIcon />
                                            <SearchField.Input placeholder={searchPlaceholder} />
                                            <SearchField.ClearButton />
                                        </SearchField.Group>
                                    </SearchField>
                                </div>
                                {visibleItems.length > 0 ? (
                                    <ul className="divide-separator max-h-[min(20rem,calc(100dvh-10rem))] divide-y overflow-y-auto">
                                        {visibleItems.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    aria-label={`Add ${item.name}`}
                                                    className="hover:bg-surface-hover focus-visible:ring-focus flex min-h-10 w-full cursor-[var(--cursor-interactive)] items-center rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-64"
                                                    disabled={isPending}
                                                    onClick={() => {
                                                        setOpen(false);
                                                        onAdd(item);
                                                    }}
                                                    type="button"
                                                >
                                                    <span className="text-foreground truncate text-sm font-medium">
                                                        {item.name}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-muted py-6 text-center text-sm">
                                        No matches.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
