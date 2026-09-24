import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChannelHoverCard, ChannelHoverCardContent } from './channel-hover-card.tsx';
import { getMentionAppearance } from './mention-appearance.tsx';
import { ReferenceChip } from './reference-chip.tsx';
import { SkillHoverCardContent } from './skill-hover-card.tsx';
import { selectSkillReferenceDescription } from './use-skill-reference-description.ts';

test('renders rich references with the shared HeroUI Chip shell', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="agent://agent_blippy"
            kind="agent"
            label="blippy"
            metadata={{
                agentAvatarUrl: '/blippy.png',
                agentColor: '#7c3aed',
                agentDisplayName: 'Blippy',
            }}
        />
    );

    expect(markup).toContain('data-slot="chip"');
    expect(markup).toContain('data-slot="chip-label"');
    expect(markup).toContain('chip--md');
    expect(markup).toContain('chip--tertiary');
    expect(markup).toContain('chip--accent');
    expect(markup).toContain('reference-chip');
    expect(markup).toContain('reference-chip__mark');
    expect(markup).toContain('align-middle');
    expect(markup).not.toContain('translate-y');
    expect(markup).not.toContain('text-sm');
    expect(markup).not.toContain('font-semibold');
    expect(markup).toContain('height:18px');
    expect(markup).toContain('width:18px');
    expect(markup).not.toContain('--chip-bg');
    expect(markup).not.toContain('--reference-chip-color');
    expect(markup).toContain('Blippy');
    expect(markup).not.toContain('data-slot="tooltip-trigger"');
    expect(markup).not.toContain('<button');
});

test('wraps transcript reference previews in HeroUI tooltip triggers', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip id="agent://agent_blippy" kind="agent" label="Blippy" preview />
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('<button');
    expect(markup).toContain('aria-label="Preview Blippy"');
});

test('renders activated references with native button semantics', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="chat://cht_product"
            kind="chat"
            label="#product"
            onActivate={() => undefined}
        />
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('align-middle');
    expect(markup).toContain('data-slot="chip"');
    expect(markup).toContain('data-slot="chip-label"');
    expect(markup).toContain('#product');
});

test('renders chat references with the shared colored Channel identity mark', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="chat://cht_product"
            kind="chat"
            label="product"
            metadata={{ chatColor: 'violet', chatIcon: 'RocketIcon' }}
        />
    );
    const chipOpenTag = markup.slice(
        markup.lastIndexOf('<span', markup.indexOf('data-slot="chip"')),
        markup.indexOf('>', markup.indexOf('data-slot="chip"'))
    );

    expect(markup).toContain('height:18px');
    expect(markup).toContain('width:18px');
    expect(markup).toContain('--channel-color-light:#7c3aed');
    expect(markup).toContain('channel-icon-box');
    expect(markup).toContain('reference-chip--channel');
    expect(markup).toContain('reference-chip__mark');
    expect(markup).toContain('chip--tertiary');
    expect(markup).toContain('chip--default');
    expect(markup).not.toContain('chip--success');
    expect(chipOpenTag).toContain('--channel-color-light:#7c3aed');
    expect(markup).not.toContain('font-semibold');
    expect(markup).not.toContain('--chip-bg');
    expect(markup).not.toContain('--reference-chip-color');
});

test('previews Channels with activity beside the title and overlapping member avatars', () => {
    const markup = renderToStaticMarkup(
        <ChannelHoverCardContent
            activityLabel="Active 1d ago"
            appearance={getMentionAppearance({
                id: 'chat://cht_product',
                kind: 'chat',
                label: 'product',
                metadata: { chatColor: 'gray', chatIcon: 'HashtagIcon' },
            })}
            displayLabel="product"
            participants={[
                { avatarUrl: '/zach.png', id: 'user_zach', name: 'Zach Knickerbocker' },
                { avatarUrl: '/blippy.png', id: 'agent_blippy', name: 'Blippy' },
                { avatarUrl: '/tiny.png', id: 'agent_tiny', name: 'Tiny' },
            ]}
        />
    );

    expect(markup).toContain('height:18px');
    expect(markup).toContain('width:18px');
    expect(markup).toContain('flex-col gap-1.5');
    expect(markup).toContain('haus-hover-card__identity');
    expect(markup).toContain('items-center gap-1.5');
    expect(markup).toContain('items-baseline gap-1.5');
    expect(markup).toContain('font-semibold text-foreground text-sm');
    expect(markup).toContain('#product');
    expect(markup).toContain('· Active 1d ago');
    expect(markup).toContain('haus-hover-card__faces');
    expect(markup).toContain('Channel members');
    expect(markup).toContain('-space-x-2');
    expect(markup).toContain('ZK');
    expect(markup).toContain('BL');
    expect(markup).toContain('TI');
    expect(markup).not.toContain('chip');
    expect(markup).not.toContain('· Channel');
    expect(markup).not.toContain('3 members');
    expect(markup).not.toContain('uppercase');
    expect(markup).not.toContain('A shared conversation in Haus.');
});

test('keeps Channel preview data dormant while its hover card is closed', () => {
    const markup = renderToStaticMarkup(
        <ChannelHoverCard
            appearance={getMentionAppearance({
                id: 'chat://cht_product',
                kind: 'chat',
                label: 'product',
                metadata: { chatColor: 'gray', chatIcon: 'HashtagIcon' },
            })}
            chatId="cht_product"
            displayLabel="product"
            serverId="srv_test"
        >
            <span>#product</span>
        </ChannelHoverCard>
    );

    expect(markup).toContain('#product');
    expect(markup).not.toContain('Channel members');
});

test('previews a Skill with a compact identity row and smaller mark', () => {
    const markup = renderToStaticMarkup(
        <SkillHoverCardContent
            appearance={getMentionAppearance({
                id: 'skill://design',
                kind: 'skill',
                label: 'design',
            })}
            description="Build polished interfaces with clear visual hierarchy."
            displayLabel="Design"
        />
    );

    expect(markup).toContain('size-[16px]');
    expect(markup.match(/<path/g)).toHaveLength(3);
    expect(markup).toContain('flex-col gap-1.5');
    expect(markup).toContain('haus-hover-card__identity');
    expect(markup).toContain('text-skill-reference');
    expect(markup).toContain('items-center gap-1.5');
    expect(markup).toContain('items-baseline gap-1.5');
    expect(markup).toContain('· Skill');
    expect(markup).toContain('Build polished interfaces with clear visual hierarchy.');
    expect(markup).toContain('text-xs leading-normal text-muted');
    expect(markup).not.toContain('line-clamp');
    expect(markup).not.toContain('data-slot="separator"');
});

test('resolves a Skill description by its stable reference target', () => {
    const description = selectSkillReferenceDescription(
        [
            {
                description: 'Build polished interfaces with clear visual hierarchy.',
                id: 'skill://design',
                insertText: 'design',
                kind: 'skill',
                label: 'design',
                projection: 'skill-activation',
                sourceLabel: 'Skills',
            },
        ],
        'design'
    );

    expect(description).toBe('Build polished interfaces with clear visual hierarchy.');
});

test('gives non-navigable references a native preview control without activating them', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="skill://design"
            kind="skill"
            label="design"
            onActivate={() => undefined}
            preview
        />
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('aria-label="Preview Design"');
    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('data-slot="chip"');
    expect(markup).toContain('chip--tertiary');
    expect(markup).toContain('chip--default');
    expect(markup).toContain('reference-chip--skill');
    expect(markup).not.toContain('chip--warning');
    expect(markup).toContain('size-[16px]');
    expect(markup).not.toContain('size-[18px]');
    expect(markup.match(/<path/g)).toHaveLength(3);
    expect(markup).not.toContain('font-semibold');
    expect(markup).not.toContain('--chip-bg');
    expect(markup).toContain('Design');
});
