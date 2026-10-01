import { type ComponentType, useId } from 'react';

/**
 * Illustrated marks for the skills Haus itself ships (factory-managed skills,
 * see docs/features/agents.md). Every other skill draws the shared skill tile.
 *
 * These are art, like brand marks: each draws its own opaque tile, so its
 * literal colors read the same on light and dark surfaces and never mix with
 * theme tokens. Keyed by the skill's stable `name`, which is what a factory
 * skill keeps across reseeds.
 */
const builtInSkillIcons = {
    visuals: VisualsSkillIcon,
} satisfies Record<string, ComponentType>;

export function builtInSkillIcon(name: string): ComponentType | null {
    return Object.hasOwn(builtInSkillIcons, name)
        ? builtInSkillIcons[name as keyof typeof builtInSkillIcons]
        : null;
}

/** `visuals` — inline charts and artifact pages: three rising bars on a soft sky tile. */
function VisualsSkillIcon() {
    const sky = useId();
    return (
        <svg
            aria-hidden="true"
            className="size-full rounded-[inherit]"
            fill="none"
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id={sky} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#EAF2FF" />
                    <stop offset="1" stopColor="#C8DBFF" />
                </linearGradient>
            </defs>
            <rect fill={`url(#${sky})`} height="32" width="32" />
            <rect fill="#FF9B57" height="8" rx="1.25" width="4.5" x="7.25" y="15.5" />
            <rect fill="#FFC444" height="12.5" rx="1.25" width="4.5" x="13.75" y="11" />
            <rect fill="#4F7FE8" height="17" rx="1.25" width="4.5" x="20.25" y="6.5" />
            <path d="M6 24.25h20" stroke="#8EA7D6" strokeLinecap="round" strokeWidth="1.25" />
        </svg>
    );
}
