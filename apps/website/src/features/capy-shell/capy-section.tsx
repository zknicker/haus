import * as React from 'react';

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
        <section aria-labelledby={labelId} className="flex flex-col gap-2">
            <div className="flex min-h-8 items-center justify-between gap-2 ps-[0.5rem]">
                <button
                    aria-expanded={!collapsed}
                    className="text-foreground min-w-0 cursor-[var(--cursor-interactive)] truncate rounded-md text-sm"
                    id={labelId}
                    onClick={() => setCollapsed((current) => !current)}
                    type="button"
                >
                    {label}
                </button>
                {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
            </div>
            {children ? <div className={collapsed ? 'hidden' : undefined}>{children}</div> : null}
        </section>
    );
}
