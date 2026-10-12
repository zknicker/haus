import type { MentionAppearance } from './mention-appearance.tsx';

export type MentionAppearanceOverride = Partial<MentionAppearance>;

/** Skills that read as a product rather than as their id. */
export const skillAppearanceOverrides = {
    'gh-issues': {
        icon: 'github',
        label: 'GitHub Issues',
    },
    github: { icon: 'github', label: 'GitHub' },
} satisfies Record<string, MentionAppearanceOverride>;

/** Apps and plugins that read as a product rather than as their id. */
export const capabilityAppearanceOverrides = {
    'computer-use@openai-bundled': {
        icon: 'plugin',
        label: 'Computer Use',
    },
    'computer-use/google-chrome': {
        brandColor: 'var(--success)',
        icon: 'chrome',
        label: 'Chrome',
    },
    'chrome@openai-bundled': {
        brandColor: 'var(--success)',
        icon: 'chrome',
        label: 'Chrome',
    },
    chrome: {
        brandColor: 'var(--success)',
        icon: 'chrome',
        label: 'Chrome',
    },
} satisfies Record<string, MentionAppearanceOverride>;
