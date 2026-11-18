import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * A nested product surface — the cards that sit inside a transcript turn, a
 * drawer, or a settings pane rather than framing a page.
 *
 * The shell geometry lives in the `.card-shell` rule (styles/heroui-overrides
 * .css) so raw call sites can name it too; this component is the typed way in
 * for new code. Spelling `rounded-3xl` at a call site instead drops HeroUI's
 * 32px cap and copies the step-pairing decision — which is how a dozen
 * surfaces drifted onto four different steps before this existed.
 *
 * Stock `Card` is the right choice for a page-level panel; it brings `p-4`,
 * `gap-3` and `shadow-surface`, which nested chat surfaces immediately have to
 * fight. This adapter carries the shell geometry and leaves padding and
 * emphasis to the caller.
 */
export type InlineCardTone = 'bordered' | 'plain' | 'surface';

const toneClassName: Record<InlineCardTone, string> = {
    bordered: 'border border-border',
    plain: '',
    surface: 'bg-surface-secondary',
};

export interface InlineCardProps extends React.ComponentProps<'div'> {
    tone?: InlineCardTone;
}

export function InlineCard({ children, className, tone = 'surface', ...props }: InlineCardProps) {
    return (
        <div
            className={cn('card-shell', toneClassName[tone], className)}
            data-slot="inline-card"
            {...props}
        >
            {children}
        </div>
    );
}
