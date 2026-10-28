import type { ColorTheme } from './color-theme.ts';

/**
 * Every color theme as one definition (.design/guidelines.md "Color themes"). Consumers
 * read the definition, never the id, so a new theme is a new entry here plus
 * its token CSS under `styles/themes/`.
 */
export interface ColorThemeDefinition {
    /** The app icon the web tab and the desktop Dock show while the theme is on. */
    readonly appIcon: AppIcon;
    /** A theme that only reads in one mode pins it; the stored Mode preference stays untouched. */
    readonly forcedMode: 'dark' | null;
    /** The Inbox greeting pools; `null` keeps the standard "Good morning, Name". */
    readonly greetings: GreetingSet | null;
    readonly id: ColorTheme;
    readonly label: string;
    /** The costume `HausMascot` wears. */
    readonly mascot: 'ghost' | 'pumpkin';
    /** The ambient art behind the shell's top-left chrome. */
    readonly scene: 'none' | 'moonlit-sky';
}

/** App icon artwork; `ghost` is the bundle's own icon. */
export type AppIcon = 'ghost' | 'pumpkin';

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Lines per part of the day. `{name}` stands for the reader's first name. */
export type GreetingSet = Readonly<Record<DayPart, readonly [string, ...string[]]>>;

const colorThemeDefinitions: Readonly<Record<ColorTheme, ColorThemeDefinition>> = {
    default: {
        appIcon: 'ghost',
        forcedMode: null,
        greetings: null,
        id: 'default',
        label: 'Default',
        mascot: 'ghost',
        scene: 'none',
    },
    halloween: {
        appIcon: 'pumpkin',
        forcedMode: 'dark',
        // A haunted-house host: elegant, gently sinister, theatrical.
        greetings: {
            afternoon: [
                "Ah, {name}. We've been expecting you",
                'Do come in, {name}',
                'The shadows grow long, {name}',
                'Welcome back, {name}. No one ever really leaves',
            ],
            evening: [
                'Good evening, dear mortal',
                "We've been dying to see you, {name}",
                'The witching hour draws near, {name}',
                'Mind the cobwebs, {name}',
            ],
            morning: [
                'Good morning, foolish mortal',
                'Up with the restless spirits, I see',
                'Something stirred while you slept, {name}',
                'The Haus has been expecting you',
            ],
        },
        id: 'halloween',
        label: 'Halloween',
        mascot: 'pumpkin',
        scene: 'moonlit-sky',
    },
};

/** Picker order for Settings and Cmd+K. */
export const colorThemes: readonly ColorThemeDefinition[] = [
    colorThemeDefinitions.default,
    colorThemeDefinitions.halloween,
];

export function colorThemeDefinition(theme: ColorTheme): ColorThemeDefinition {
    return colorThemeDefinitions[theme];
}
