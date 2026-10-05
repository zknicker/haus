import { Clock01Icon, FlashIcon } from '@hugeicons-pro/core-stroke-rounded';
import { identityMarkRadius } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import {
    type AutomationKind,
    automationMarkColor,
    automationMarkSoftFill,
} from './automation-presentation.ts';

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
 *
 * `avatar` is the 16px mark that stands in for an author on a turn's context
 * line: the same bounds as the 16px `EntityAvatar` on a reply line, filled
 * with a soft tint of the automation's ink, with the glyph larger relative to
 * the box so it still reads at that size.
 */
export function AutomationGlyphBox({
    kind,
    variant = 'title',
}: {
    kind: AutomationKind;
    variant?: 'avatar' | 'title';
}) {
    const { box, glyph } = glyphBoxSize[variant];
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex shrink-0 items-center justify-center',
                variant === 'avatar' ? automationMarkSoftFill[kind] : 'bg-surface-tertiary',
                automationMarkColor[kind]
            )}
            style={{ borderRadius: identityMarkRadius(box), height: box, width: box }}
        >
            <AutomationGlyph kind={kind} size={glyph} />
        </span>
    );
}

const glyphBoxSize = {
    avatar: { box: 16, glyph: 12 },
    title: { box: 24, glyph: 14 },
} as const;
