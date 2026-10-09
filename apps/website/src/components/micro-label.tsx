import type * as React from 'react';

/**
 * The developer surfaces' one section label: muted, `xs`, uppercase, wide
 * tracking, so a code block's `PYTHON` and a trace's `COMMAND`, `OUTPUT`, or
 * fact `TO` all read as one tier above or beside their content. Labels are
 * the only uppercase text in a block; what they name stays in sentence case.
 */
export function MicroLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="font-medium text-muted text-xs uppercase tracking-wide">{children}</span>
    );
}
