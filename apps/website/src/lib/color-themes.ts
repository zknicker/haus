import { type ColorTheme, isCustomTheme, type PresetTheme } from './color-theme.ts';
import type { BackgroundSource } from './home-background.ts';

/**
 * Every color theme as one definition (.design/guidelines.md "Color themes"). Consumers
 * read the definition, never the id, so a new theme is a new entry here plus
 * its token CSS under `styles/themes/`.
 */
export interface ColorThemeDefinition {
    /** The app icon the web tab and the desktop Dock show while the theme is on. */
    readonly appIcon: AppIcon;
    /** What Home draws behind its composer until this device picks another (`home-background.ts`). */
    readonly background: BackgroundSource;
    /** A theme that only reads in one mode pins it; the stored Mode preference stays untouched. */
    readonly forcedMode: 'dark' | 'light' | null;
    /** The Inbox greeting pools; `null` keeps the standard "Good morning, Name". */
    readonly greetings: GreetingSet | null;
    /** `haus` layers over the default ladder; `palette` sets base colors and lets
        `palette-ground.css` derive the rest of the ladder from them. */
    readonly ground: 'haus' | 'palette';
    readonly id: PresetTheme;
    readonly label: string;
    /** The costume `HausMascot` wears. */
    readonly mascot: 'ghost' | 'pumpkin' | 'santa';
    /** The ambient art in the shell's chrome: Halloween's moonlit sky behind the top-left
        corner, or Christmas's snowy roofline of lights along the window's top edge. */
    readonly scene: 'none' | 'moonlit-sky' | 'snowy-roofline';
}

/** App icon artwork; `ghost` is the bundle's own icon, `santa` the ghost in its nightcap. */
export type AppIcon = 'ghost' | 'pumpkin' | 'santa';

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Lines per part of the day. `{name}` stands for the reader's first name. */
export type GreetingSet = Readonly<Record<DayPart, readonly [string, ...string[]]>>;

/** An innkeeper by the fire: warm, unhurried, glad you came in out of the cold. */
const innkeeperGreetings: GreetingSet = {
    afternoon: [
        'Pull up a chair, {name}',
        "The cider's warm, {name}",
        'Welcome back, {name}. Stay a while',
        'Mind the tinsel, {name}',
    ],
    evening: [
        "Good evening, {name}. The fire's going",
        'Cocoa, {name}? The marshmallows are in',
        'The lights are on, {name}',
        "Settle in, {name}. It's a long night",
    ],
    morning: [
        "Morning, {name}. The kettle's on",
        'Come in out of the cold, {name}',
        'It snowed all night, {name}',
        'Boots by the door, {name}',
    ],
};

const colorThemeDefinitions: Readonly<Record<PresetTheme, ColorThemeDefinition>> = {
    default: plainTheme('default', 'Haus', 'haus', 'none'),
    oled: plainTheme('oled', 'OLED', 'haus', 'none'),
    catppuccin: plainTheme('catppuccin', 'Catppuccin', 'palette', 'aurora'),
    gruvbox: plainTheme('gruvbox', 'Gruvbox', 'palette', 'dots'),
    everforest: plainTheme('everforest', 'Everforest', 'palette', 'contours'),
    nord: plainTheme('nord', 'Nord', 'palette', 'horizon'),
    one: plainTheme('one', 'One', 'palette', 'dots'),
    mauve: plainTheme('mauve', 'Mauve', 'palette', 'aurora'),
    halloween: {
        appIcon: 'pumpkin',
        background: 'ghosts',
        forcedMode: 'dark',
        ground: 'haus',
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
    'christmas-eve': {
        appIcon: 'santa',
        background: 'horizon',
        forcedMode: 'dark',
        greetings: innkeeperGreetings,
        ground: 'haus',
        id: 'christmas-eve',
        label: 'Christmas Eve',
        mascot: 'santa',
        scene: 'snowy-roofline',
    },
    'christmas-morning': {
        appIcon: 'santa',
        background: 'horizon',
        forcedMode: 'light',
        greetings: innkeeperGreetings,
        ground: 'haus',
        id: 'christmas-morning',
        label: 'Christmas Morning',
        mascot: 'santa',
        scene: 'snowy-roofline',
    },
};

/** Picker order for Settings and Cmd+K. */
export const colorThemes: readonly ColorThemeDefinition[] = Object.values(colorThemeDefinitions);

/** A custom theme wears nothing but its colors, which are always a palette. */
const customThemeDefinition: ColorThemeDefinition = {
    ...colorThemeDefinitions.default,
    background: 'none',
    ground: 'palette',
};

export function colorThemeDefinition(theme: ColorTheme): ColorThemeDefinition {
    return isCustomTheme(theme) ? customThemeDefinition : colorThemeDefinitions[theme];
}

function plainTheme(
    id: PresetTheme,
    label: string,
    ground: ColorThemeDefinition['ground'],
    background: BackgroundSource
) {
    return {
        appIcon: 'ghost',
        background,
        forcedMode: null,
        greetings: null,
        ground,
        id,
        label,
        mascot: 'ghost',
        scene: 'none',
    } as const satisfies ColorThemeDefinition;
}
