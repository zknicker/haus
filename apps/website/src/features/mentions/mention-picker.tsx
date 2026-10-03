import { Spinner } from '@heroui/react';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { getMentionAppearance, MentionAppearanceIcon } from './mention-appearance.tsx';
import { getMentionDisplayLabel } from './mention-display-label.ts';
import type { MentionOption } from './mention-types.ts';

export function MentionPicker({
    activeIndex,
    className,
    hasQuery,
    isPathSearchActive,
    isPathSearchLoading,
    onSelect,
    options,
}: {
    activeIndex: number;
    className?: string;
    hasQuery: boolean;
    isPathSearchActive: boolean;
    isPathSearchLoading: boolean;
    onSelect: (option: MentionOption) => void;
    options: MentionOption[];
}) {
    const optionRefs = React.useRef(new Map<number, HTMLButtonElement>());
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

    React.useLayoutEffect(() => {
        const option = optionRefs.current.get(activeIndex);
        const scrollContainer = scrollContainerRef.current;

        if (!(option && scrollContainer)) {
            return;
        }

        scrollOptionIntoView(option, scrollContainer);
    }, [activeIndex]);

    if (!(hasQuery || options.length > 0)) {
        return null;
    }

    const groups = groupMentionOptions({
        isPathSearchActive,
        isPathSearchLoading,
        options,
    });
    const hasVisibleRows = groups.some(
        (group) => group.options.length > 0 || group.status !== undefined
    );

    return (
        <div
            className={cn(
                'card-shell absolute right-0 bottom-[calc(100%+0.4rem)] left-0 z-20 flex max-h-64 w-full flex-col overflow-hidden border border-separator bg-overlay p-1 text-sm shadow-overlay',
                className
            )}
            role="listbox"
        >
            <div
                className="flex w-full flex-1 flex-col overflow-y-auto"
                data-testid="mention-list-scroll"
                ref={scrollContainerRef}
            >
                <div className="flex w-full flex-col">
                    {hasVisibleRows ? null : <div className="px-2 py-2 text-muted">No results</div>}
                    {groups.map((group, groupIndex) => (
                        <div key={group.label}>
                            <div
                                className={cn(
                                    'sticky top-0 z-10 bg-overlay px-2 py-1 text-muted',
                                    groupIndex > 0 && 'pt-2'
                                )}
                                data-mention-group-label
                            >
                                {group.label}
                            </div>
                            {group.status ? (
                                <div className="flex h-8 items-center gap-2 px-2 text-muted">
                                    <Spinner color="current" size="sm" />
                                    <span>Searching files...</span>
                                </div>
                            ) : null}
                            {group.options.map(({ index, option }) => {
                                const appearance = getMentionAppearance(option);
                                const displayLabel = getMentionDisplayLabel(option);

                                return (
                                    <button
                                        aria-selected={index === activeIndex}
                                        className={cn(
                                            'card-shell h-8 w-full shrink-0 cursor-(--cursor-interactive) overflow-hidden px-2.5 text-left text-foreground outline-hidden focus:bg-default',
                                            index === activeIndex
                                                ? 'bg-default'
                                                : 'hover:bg-default'
                                        )}
                                        key={`${option.kind}:${option.id}:${option.label}`}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            onSelect(option);
                                        }}
                                        ref={(element) => {
                                            if (element) {
                                                optionRefs.current.set(index, element);
                                                return;
                                            }

                                            optionRefs.current.delete(index);
                                        }}
                                        role="option"
                                        type="button"
                                    >
                                        <span className="flex w-full min-w-0 items-center gap-1 leading-normal">
                                            <MentionAppearanceIcon
                                                agentAvatar={appearance.agentAvatar}
                                                className={cn(
                                                    'shrink-0 text-foreground',
                                                    appearance.agentAvatar
                                                        ? undefined
                                                        : 'size-[15px] rounded-sm object-contain'
                                                )}
                                                icon={appearance.icon}
                                                iconDataUrl={appearance.iconDataUrl}
                                            />
                                            <span
                                                className={cn(
                                                    'truncate font-medium text-foreground',
                                                    option.description && 'shrink-0'
                                                )}
                                            >
                                                {displayLabel}
                                            </span>
                                            {option.description ? (
                                                <span className="min-w-0 flex-1 truncate text-muted">
                                                    {option.description}
                                                </span>
                                            ) : null}
                                            {option.sourceLabel && !option.description ? (
                                                <span className="min-w-0 flex-1 truncate text-muted">
                                                    {option.sourceLabel}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function scrollOptionIntoView(option: HTMLElement, scrollContainer: HTMLElement) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    const stickyHeaderOffset = getStickyHeaderOffset(scrollContainer);
    const visibleTop = containerRect.top + stickyHeaderOffset;
    const visibleBottom = containerRect.bottom;

    if (optionRect.top < visibleTop) {
        scrollContainer.scrollTop -= visibleTop - optionRect.top;
        return;
    }

    if (optionRect.bottom > visibleBottom) {
        scrollContainer.scrollTop += optionRect.bottom - visibleBottom;
    }
}

function getStickyHeaderOffset(scrollContainer: HTMLElement) {
    const header = scrollContainer.querySelector<HTMLElement>('[data-mention-group-label]');

    return header?.getBoundingClientRect().height ?? 0;
}

function groupMentionOptions({
    isPathSearchActive,
    isPathSearchLoading,
    options,
}: {
    isPathSearchActive: boolean;
    isPathSearchLoading: boolean;
    options: MentionOption[];
}) {
    const groups: Array<{
        label: string;
        options: Array<{ index: number; option: MentionOption }>;
        status?: 'loading';
    }> = [];

    options.forEach((option, index) => {
        const label = getGroupLabel(option);
        let group = groups.find((entry) => entry.label === label);

        if (!group) {
            group = {
                label,
                options: [],
            };
            groups.push(group);
        }

        group.options.push({ index, option });
    });

    if (
        isPathSearchActive &&
        isPathSearchLoading &&
        !groups.some((group) => group.label === 'Files')
    ) {
        groups.push({
            label: 'Files',
            options: [],
            status: 'loading',
        });
    }

    return groups;
}

function getGroupLabel(option: MentionOption) {
    if (option.groupLabel) {
        return option.groupLabel;
    }

    if (option.kind === 'agent') {
        return 'Agents';
    }

    if (option.kind === 'user') {
        return 'Humans';
    }

    if (option.kind === 'chat') {
        return 'Channels';
    }

    if (option.kind === 'app') {
        return 'Mac apps';
    }

    if (option.kind === 'plugin') {
        return 'Plugins';
    }

    if (option.kind === 'file' || option.kind === 'directory' || option.kind === 'image') {
        return 'Files';
    }

    return 'Skills';
}
