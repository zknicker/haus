import type * as React from 'react';
import { cn } from '../lib/utils.ts';
import { CopyButton } from './copy-button.tsx';

interface CodeSnippetProps extends Omit<React.ComponentProps<'div'>, 'children'> {
    copyValue?: string;
    lines: string | string[];
}

/** Inline copyable command row (install commands, tokens). */
export function CodeSnippet({ className, copyValue, lines, ...props }: CodeSnippetProps) {
    const normalizedLines = Array.isArray(lines) ? lines : [lines];
    const isMultiLine = normalizedLines.length > 1;
    const value = copyValue ?? normalizedLines.join('\n');

    return (
        <div
            className={cn(
                'card-shell bg-surface-secondary text-foreground flex min-w-0 gap-2 ps-3 pe-1 font-mono text-sm',
                isMultiLine ? 'items-start py-1.5' : 'h-8 items-center',
                className
            )}
            {...props}
        >
            <code
                className={cn(
                    'scrollbar-none min-w-0 flex-1 overflow-x-auto',
                    isMultiLine ? 'break-all whitespace-pre-wrap' : 'whitespace-nowrap'
                )}
            >
                {normalizedLines.join('\n')}
            </code>
            <CopyButton label="Copy code" value={value} />
        </div>
    );
}
