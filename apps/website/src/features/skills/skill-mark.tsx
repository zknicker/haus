import { useId } from 'react';
import { builtInSkillIcon } from './built-in-skill-icons.tsx';

/**
 * A skill's mark, drawn inside a host box — `ItemCard.Icon` in lists and
 * grids, `Modal.Icon` in dialogs — which owns the size, fill, and radius. The
 * SKILL.md contract carries no icon, so every skill shares one illustrated
 * cube; only the skills Haus ships draw their own illustration.
 */
export function SkillMark({ name }: { name: string }) {
    const Illustration = builtInSkillIcon(name);
    if (Illustration) {
        return <Illustration />;
    }
    return <SkillCube />;
}

/**
 * The shared skill mark: a small packaged cube, warm on top and violet on its
 * sides, so a plain skill reads as a little product rather than a line glyph.
 * Art, like a brand mark — literal colors that hold on light and dark tiles.
 * The host sizes the `svg`.
 */
function SkillCube() {
    const top = useId();
    const left = useId();
    const right = useId();
    return (
        <svg
            aria-hidden="true"
            fill="none"
            viewBox="2.5 1.75 19 20.5"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id={top} x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#FFC46B" />
                    <stop offset="1" stopColor="#FF8A4C" />
                </linearGradient>
                <linearGradient id={left} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#A78BFA" />
                    <stop offset="1" stopColor="#7C5CF0" />
                </linearGradient>
                <linearGradient id={right} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#F472B6" />
                    <stop offset="1" stopColor="#D9468F" />
                </linearGradient>
            </defs>
            <g strokeLinejoin="round" strokeWidth="1.5">
                <path
                    d="M12 2.75 20.25 7.25 12 11.75 3.75 7.25Z"
                    fill={`url(#${top})`}
                    stroke={`url(#${top})`}
                />
                <path
                    d="M3.75 7.25 12 11.75v9.5l-8.25-4.5Z"
                    fill={`url(#${left})`}
                    stroke={`url(#${left})`}
                />
                <path
                    d="M20.25 7.25 12 11.75v9.5l8.25-4.5Z"
                    fill={`url(#${right})`}
                    stroke={`url(#${right})`}
                />
            </g>
            <path
                d="M12 11.75v9.5M3.75 7.25 12 11.75l8.25-4.5"
                stroke="#FFFFFF"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.55"
                strokeWidth="0.75"
            />
        </svg>
    );
}
