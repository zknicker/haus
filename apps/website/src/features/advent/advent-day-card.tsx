import type { AdventEntry } from '@haus/api';
import { Button } from '@heroui/react';
import { motion, useReducedMotion } from 'motion/react';
import { AdventLine, adventFallbackLine } from './advent-line.tsx';
import { dayOrnament, ornamentArt } from './ornaments.ts';

/**
 * A door's text as far as the calendar read has got: nothing yet (the text
 * area stays blank), the entry, or the in-voice fallback when the read
 * failed. The fallback never stands in numbers.
 */
export type AdventDayText =
    | { readonly kind: 'pending' }
    | { readonly kind: 'failed' }
    | { readonly entry: AdventEntry; readonly kind: 'entry' };

/**
 * The card a door opens onto, in place of the doors: the day's ornament large
 * beside the innkeeper's line, with "See all days" right under the words, so
 * the dialog fits the card and nothing is left behind it. It slides in (no
 * slide with reduced motion). Dec 24 is the recap.
 */
export function AdventDayCard({
    day,
    onBack,
    text,
}: {
    day: number;
    onBack: () => void;
    text: AdventDayText;
}) {
    const reducedMotion = useReducedMotion() === true;
    const entry = text.kind === 'entry' ? text.entry : null;
    return (
        <motion.article
            animate={{ opacity: 1, x: 0 }}
            aria-label={`December ${day}`}
            initial={reducedMotion ? false : { opacity: 0, x: 24 }}
            transition={{ duration: 0.35, ease: [0.215, 0.61, 0.355, 1] }}
        >
            {entry?.kind === 'recap' ? (
                <RecapBody day={day} entry={entry} onBack={onBack} />
            ) : (
                <div className="flex items-start gap-4">
                    <CardOrnament day={day} size={96} />
                    <div className="min-w-0 flex-1 pt-2">
                        <p className="font-medium text-muted text-xs">{dayLabel(day)}</p>
                        <FactText text={text} />
                        <div className="mt-4">
                            <SeeAllDays onBack={onBack} />
                        </div>
                    </div>
                </div>
            )}
        </motion.article>
    );
}

function SeeAllDays({ onBack }: { onBack: () => void }) {
    return (
        <div className="flex">
            <Button autoFocus onPress={onBack} size="sm" variant="secondary">
                See all days
            </Button>
        </div>
    );
}

function FactText({ text }: { text: AdventDayText }) {
    if (text.kind === 'pending') {
        return null;
    }
    if (text.kind === 'failed') {
        return <p className="mt-2 text-muted text-sm leading-relaxed">{adventFallbackLine}</p>;
    }
    const { entry } = text;
    return (
        <>
            <h3 className="mt-0.5 mb-2 font-semibold text-foreground text-lg leading-snug tracking-tight">
                {entry.title}
            </h3>
            <p className="text-muted text-sm leading-relaxed" data-selectable-text>
                <AdventLine runs={entry.kind === 'recap' ? entry.closing : entry.line} />
            </p>
        </>
    );
}

function RecapBody({
    day,
    entry,
    onBack,
}: {
    day: number;
    entry: Extract<AdventEntry, { kind: 'recap' }>;
    onBack: () => void;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <CardOrnament day={day} size={56} />
                <div className="min-w-0">
                    <p className="font-medium text-muted text-xs">{`Day ${day} · Christmas Eve`}</p>
                    <h3 className="font-semibold text-foreground text-lg leading-snug tracking-tight">
                        {entry.title}
                    </h3>
                </div>
            </div>
            <dl className="grid grid-cols-4 gap-x-3 gap-y-3" data-selectable-text>
                {entry.stats.map((stat) => (
                    <div className="flex min-w-0 flex-col-reverse" key={stat.label}>
                        <dt className="text-muted text-xs leading-tight">{stat.label}</dt>
                        <dd className="truncate font-semibold text-base text-foreground tracking-tight">
                            {stat.value}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="text-muted text-sm leading-relaxed" data-selectable-text>
                <AdventLine runs={entry.closing} />
            </p>
            <SeeAllDays onBack={onBack} />
        </div>
    );
}

/** The day's ornament standing in a soft pool of the niche's light. */
function CardOrnament({ day, size }: { day: number; size: number }) {
    const ornament = dayOrnament(day);
    return (
        <span
            aria-hidden="true"
            className="advent-card__ornament"
            style={{ height: size, width: size }}
        >
            <img alt="" draggable={false} height={size} src={ornamentArt[ornament]} width={size} />
        </span>
    );
}

function dayLabel(day: number) {
    return `Day ${day} · December ${day}`;
}
