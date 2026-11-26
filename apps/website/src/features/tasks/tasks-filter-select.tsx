import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Button, Label, ListBox } from '@heroui/react';
import type * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils.ts';

export const anyFilter = 'any';

const filterNames = ['state'] as const;
export type TasksFilterName = (typeof filterNames)[number];

export function FilterSelect({
    children,
    label,
    onChange,
    selected,
    value,
}: {
    children: React.ReactNode;
    label: string;
    onChange: (next: null | string) => void;
    selected: string;
    value: null | string;
}) {
    return (
        <InlineSelect
            aria-label={`Filter by ${label.toLowerCase()}`}
            onChange={(next) => onChange(next === null || next === anyFilter ? null : String(next))}
            value={value ?? anyFilter}
        >
            <InlineSelect.Trigger className="gap-1">
                <span className="text-muted text-sm">{label}</span>
                <span className={cn('truncate text-sm', value === null && 'text-muted')}>
                    {selected}
                </span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                {children}
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

export function AnyItem() {
    return (
        <ListBox.Item id={anyFilter} textValue="Any">
            <Label>Any</Label>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}

export function ClearFiltersButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
    const [, setParams] = useSearchParams();
    return (
        <Button
            onPress={() =>
                setParams(
                    (params) => {
                        const next = new URLSearchParams(params);
                        for (const name of filterNames) {
                            next.delete(name);
                        }
                        return next;
                    },
                    { replace: true }
                )
            }
            size="sm"
            variant={variant}
        >
            Clear filters
        </Button>
    );
}

export function useSetFilter() {
    const [, setParams] = useSearchParams();
    return (name: TasksFilterName, value: null | string) =>
        setParams(
            (params) => {
                const next = new URLSearchParams(params);
                if (value === null) {
                    next.delete(name);
                } else {
                    next.set(name, value);
                }
                return next;
            },
            { replace: true }
        );
}
