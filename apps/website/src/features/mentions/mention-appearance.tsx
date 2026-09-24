import type { IconSvgElement } from '@hugeicons/react';
import {
    ChromeIcon,
    CubeIcon,
    File01Icon,
    Folder01Icon,
    Github01Icon,
    HashtagIcon,
    Image01Icon,
    MagicWand01Icon,
    PlugIcon,
    UserIcon,
} from '@hugeicons-pro/core-solid-rounded';
import { GitPullRequestIcon, Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { formatSkillName } from '../skills/skill-name-format.ts';
import { AiSparklesIcon } from './ai-sparkles-icon.ts';
import type { ReferenceKind } from './mention-types.ts';

const mentionIconKeys = [
    'agent',
    'chat',
    'chrome',
    'file',
    'folder',
    'github',
    'image',
    'plugin',
    'pull-request',
    'skill',
    'unknown',
    'user',
    'website',
] as const;

export type MentionIconKey = (typeof mentionIconKeys)[number];

export interface MentionAppearance {
    agentAvatar?: { name: string; src: string | null };
    brandColor?: string;
    channelAppearance?: { color: string | null; icon: string | null };
    icon: MentionIconKey;
    iconDataUrl?: string;
    label?: string;
}

interface MentionAppearanceInput {
    id: string;
    kind: ReferenceKind;
    label: string;
    metadata?: Record<string, unknown>;
}

type MentionAppearanceOverride = Partial<MentionAppearance>;

const defaultMentionAppearance = {
    agent: { icon: 'agent' },
    app: { icon: 'plugin' },
    chat: { channelAppearance: { color: null, icon: null }, icon: 'chat' },
    directory: { icon: 'folder' },
    file: { icon: 'file' },
    image: { icon: 'image' },
    plugin: { icon: 'plugin' },
    product: { icon: 'image' },
    'pull-request': { icon: 'pull-request' },
    skill: { icon: 'skill' },
    user: { icon: 'user' },
    website: { icon: 'website' },
} satisfies Record<ReferenceKind, MentionAppearance>;

const skillAppearanceOverrides = {
    'gh-issues': {
        icon: 'github',
        label: 'GitHub Issues',
    },
    github: { icon: 'github', label: 'GitHub' },
} satisfies Record<string, MentionAppearanceOverride>;

const capabilityAppearanceOverrides = {
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

const mentionIconMap = {
    agent: CubeIcon,
    chat: HashtagIcon,
    chrome: ChromeIcon,
    file: File01Icon,
    folder: Folder01Icon,
    github: Github01Icon,
    image: Image01Icon,
    plugin: PlugIcon,
    'pull-request': GitPullRequestIcon,
    skill: AiSparklesIcon,
    unknown: MagicWand01Icon,
    user: UserIcon,
    website: Globe02Icon,
} satisfies Record<MentionIconKey, IconSvgElement>;

export function getMentionAppearance(input: MentionAppearanceInput): MentionAppearance {
    const base = defaultMentionAppearance[input.kind];
    const override = getMentionAppearanceOverride(input);

    return {
        ...base,
        ...override,
    };
}

export function MentionAppearanceIcon({
    agentAvatar,
    channelAppearance,
    className,
    iconDataUrl,
    icon,
    size = 'reference',
}: {
    agentAvatar?: MentionAppearance['agentAvatar'];
    channelAppearance?: MentionAppearance['channelAppearance'];
    className?: string;
    iconDataUrl?: string;
    icon: MentionIconKey;
    size?: 'preview' | 'reference';
}) {
    if (agentAvatar) {
        const avatarSize = size === 'preview' ? 44 : 18;
        return (
            <EntityAvatar
                className={className}
                name={agentAvatar.name}
                size={avatarSize}
                src={agentAvatar.src}
            />
        );
    }

    if (channelAppearance) {
        return (
            <ChannelIconBox
                className={className}
                color={channelAppearance.color}
                icon={channelAppearance.icon}
                size={size}
            />
        );
    }

    if (iconDataUrl) {
        return (
            <span className={cn('relative inline-grid', className)}>
                <Icon className="size-full" icon={mentionIconMap[icon]} />
                <span
                    aria-hidden="true"
                    className="absolute inset-0 size-full bg-center bg-contain bg-no-repeat"
                    style={{ backgroundImage: `url("${iconDataUrl.replaceAll('"', '\\"')}")` }}
                />
            </span>
        );
    }

    return <Icon className={className} icon={mentionIconMap[icon]} />;
}

export function getMentionDisplayLabel(input: MentionAppearanceInput) {
    const appearanceLabel = getMentionAppearance(input).label;
    if (appearanceLabel) {
        return appearanceLabel;
    }

    return input.kind === 'skill' ? formatSkillName(input.label) : input.label;
}

function getMentionAppearanceOverride(input: MentionAppearanceInput) {
    const metadataIconDataUrl = readString(input.metadata?.iconDataUrl);

    if (input.kind === 'agent') {
        return getAgentAvatarOverride(input);
    }

    if (input.kind === 'user') {
        return getUserAvatarOverride(input);
    }

    if (input.kind === 'chat') {
        return {
            channelAppearance: {
                color: readString(input.metadata?.chatColor),
                icon: readString(input.metadata?.chatIcon),
            },
        } satisfies MentionAppearanceOverride;
    }

    if (
        (input.kind === 'app' || input.kind === 'website' || input.kind === 'product') &&
        metadataIconDataUrl
    ) {
        return {
            iconDataUrl: metadataIconDataUrl,
        } satisfies MentionAppearanceOverride;
    }

    if (input.kind === 'skill') {
        return getKeyedOverride(skillAppearanceOverrides, input);
    }

    if (input.kind === 'app' || input.kind === 'plugin') {
        return getKeyedOverride(capabilityAppearanceOverrides, input);
    }

    return undefined;
}

function getUserAvatarOverride(input: MentionAppearanceInput) {
    const displayName = readString(input.metadata?.userDisplayName) ?? input.label;
    const avatarUrl = readString(input.metadata?.userAvatarUrl);

    return {
        agentAvatar: { name: displayName, src: avatarUrl },
        label: displayName,
    } satisfies MentionAppearanceOverride;
}

// Composer chips capture appearance at pick time; transcript chips resolve the live record.
function getAgentAvatarOverride(input: MentionAppearanceInput) {
    const color = readString(input.metadata?.agentColor);
    const liveDisplayName = readString(input.metadata?.agentDisplayName);
    const displayName = liveDisplayName ?? input.label;

    return {
        agentAvatar: { name: displayName, src: readString(input.metadata?.agentAvatarUrl) },
        ...(color ? { brandColor: color } : {}),
        ...(liveDisplayName ? { label: liveDisplayName } : {}),
    } satisfies MentionAppearanceOverride;
}

function getKeyedOverride(
    overrides: Record<string, MentionAppearanceOverride>,
    input: MentionAppearanceInput
) {
    for (const key of getMentionLookupKeys(input)) {
        const override = overrides[key];

        if (override) {
            return override;
        }
    }

    return undefined;
}

function getMentionLookupKeys(input: MentionAppearanceInput) {
    if (input.kind === 'app') {
        return [normalizeLookupKey(input.label)].filter(isPresent);
    }

    return [
        normalizeLookupKey(input.id),
        normalizeLookupKey(input.label),
        normalizeLookupKey(getMentionUriName(input.id)),
    ].filter(isPresent);
}

function getMentionUriName(id: string) {
    const match = id.match(/^(?:app|plugin|skill):\/\/(.+)$/u);
    return match?.[1] ?? null;
}

function normalizeLookupKey(value: string | null) {
    return value?.trim().replace(/^@/u, '').replace(/^\$/u, '').toLowerCase() || null;
}

function isPresent<T>(value: T | null | undefined): value is T {
    return value != null;
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
