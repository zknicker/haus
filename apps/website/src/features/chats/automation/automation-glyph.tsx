import { Clock01Icon, FlashIcon } from '@hugeicons-pro/core-stroke-rounded';
import { identityMarkRadius } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { type AutomationKind, automationMarkColor } from './automation-presentation.ts';

const automationGlyph = {
    reminder: Clock01Icon,
    trigger: FlashIcon,
} as const satisfies Record<AutomationKind, unknown>;

/**
 * The bolt and the clock at the same optical weight. Both hugeicons glyphs
 * draw to the full 24-unit box, so one pixel size gives them the same drawn
 * height — sizing the clock up, as a glyph inset in its own artboard would
 * need, would make it the larger of the two here.
 */
export function AutomationGlyph({
    className,
    kind,
    size = 14,
}: {
    className?: string;
    kind: AutomationKind;
    size?: number;
}) {
    return (
        <Icon
            className={cn('shrink-0', className)}
            icon={automationGlyph[kind]}
            size={size}
            strokeWidth={1.6}
            style={{ height: size, width: size }}
        />
    );
}

/**
 * The glyph in its own box, for the surfaces that give the automation a title
 * line of its own. Exact box, so it derives its radius the way every other
 * fixed identity mark in the app does.
 */
export function AutomationGlyphBox({ kind }: { kind: AutomationKind }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex shrink-0 items-center justify-center bg-surface-tertiary',
                automationMarkColor[kind]
            )}
            style={{
                borderRadius: identityMarkRadius(glyphBox),
                height: glyphBox,
                width: glyphBox,
            }}
        >
            <AutomationGlyph kind={kind} size={14} />
        </span>
    );
}

const glyphBox = 24;
