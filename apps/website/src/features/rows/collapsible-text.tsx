import { cn } from '../../lib/utils.ts';

export function CollapsibleText({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('break-words whitespace-pre-wrap', className)} data-selectable-text="">
            {children}
        </div>
    );
}
