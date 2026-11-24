import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';

export function CapySection({
    action,
    children,
    label,
}: {
    action?: React.ReactNode;
    children?: React.ReactNode;
    label: string;
}) {
    const [collapsed, setCollapsed] = React.useState(false);
    const labelId = React.useId();

    return (
        <section aria-labelledby={labelId} className="flex flex-col gap-1">
            <div className="group/section flex min-h-7 items-center justify-between gap-2 ps-(--sidebar-mark-inset)">
                <button
                    aria-expanded={!collapsed}
                    className="text-muted hover:text-foreground flex min-w-0 cursor-[var(--cursor-interactive)] items-center gap-1 rounded-md text-sm font-medium"
                    id={labelId}
                    onClick={() => setCollapsed((current) => !current)}
                    type="button"
                >
                    <span className="truncate">{label}</span>
                    <Icon
                        aria-hidden="true"
                        className={cn(
                            'shrink-0 transition-[opacity,rotate] duration-150',
                            collapsed
                                ? '-rotate-90'
                                : 'opacity-0 group-focus-within/section:opacity-100 group-hover/section:opacity-100'
                        )}
                        icon={ArrowDown01Icon}
                        size={12}
                    />
                </button>
                {action ? (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-focus-within/section:opacity-100 group-hover/section:opacity-100 pointer-coarse:opacity-100">
                        {action}
                    </div>
                ) : null}
            </div>
            {children ? <div className={collapsed ? 'hidden' : undefined}>{children}</div> : null}
        </section>
    );
}
