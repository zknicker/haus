import { Sidebar } from '@heroui-pro/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';

/** A folding sidebar section. `action` shows on hover; `trailing` always shows. */
export function ChatGroup({
    action,
    children,
    label,
    trailing,
}: {
    action?: React.ReactNode;
    children: React.ReactNode;
    label: string;
    trailing?: React.ReactNode;
}) {
    const [collapsed, setCollapsed] = React.useState(false);

    return (
        <Sidebar.Group>
            {/* The label is the disclosure, so a long channel list can be folded
                away without spending a row on a control. */}
            <div className="group/section flex w-full items-center justify-between">
                <button
                    aria-expanded={!collapsed}
                    // ps mirrors the literal 0.5rem HeroUI pads menu rows with,
                    // so the caret keeps the icons' left edge at any density.
                    className="flex min-w-0 cursor-[var(--cursor-interactive)] items-center gap-0.5 rounded-lg ps-[0.5rem]"
                    onClick={() => setCollapsed((current) => !current)}
                    type="button"
                >
                    {/* Caret leads the label: it points at what it folds, and
                        keeps the disclosure on the sidebar's left rhythm. */}
                    <Icon
                        aria-hidden="true"
                        className={cn(
                            'shrink-0 text-muted transition-transform',
                            collapsed && '-rotate-90'
                        )}
                        icon={ArrowDown01Icon}
                        size={12}
                        style={{ height: 12, width: 12 }}
                    />
                    <Sidebar.GroupLabel className="px-0">{label}</Sidebar.GroupLabel>
                </button>
                {/* Quiet chrome: the action only appears on hover or focus,
                    the way HeroUI's own menu actions behave. */}
                <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/section:opacity-100">
                    {action}
                </span>
                {trailing}
            </div>
            <div className={collapsed ? 'hidden' : undefined}>{children}</div>
        </Sidebar.Group>
    );
}
