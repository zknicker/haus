import { describe, expect, it } from 'bun:test';
import { getMentionAppearance } from './mention-appearance.tsx';
import { getMentionDisplayLabel } from './mention-display-label.ts';

describe('mention appearance', () => {
    it('keeps generic skills on the default skill appearance', () => {
        expect(
            getMentionAppearance({
                id: 'skill://ui',
                kind: 'skill',
                label: 'ui',
            })
        ).toEqual({
            icon: 'skill',
        });
        expect(
            getMentionDisplayLabel({
                id: 'skill://my-skill',
                kind: 'skill',
                label: 'my-skill',
            })
        ).toBe('My Skill');
    });

    it('uses the hash icon for chat references', () => {
        expect(
            getMentionAppearance({
                id: 'chat://cht_product',
                kind: 'chat',
                label: '#product',
            })
        ).toEqual({ channelAppearance: { color: null, icon: null }, icon: 'chat' });
    });

    it('resolves bundled GitHub skills to branded presentation', () => {
        const input = {
            id: 'skill://github',
            kind: 'skill' as const,
            label: 'github',
        };

        expect(getMentionAppearance(input)).toEqual({
            icon: 'github',
            label: 'GitHub',
        });
        expect(getMentionDisplayLabel(input)).toBe('GitHub');
    });

    it('resolves specialized GitHub workflow skills without changing their kind', () => {
        expect(
            getMentionAppearance({
                id: 'skill://gh-issues',
                kind: 'skill',
                label: 'gh-issues',
            })
        ).toEqual({
            icon: 'github',
            label: 'GitHub Issues',
        });
    });

    it('resolves bundled Codex plugin and Computer Use app targets', () => {
        expect(
            getMentionAppearance({
                id: 'plugin://computer-use@openai-bundled',
                kind: 'plugin',
                label: 'Computer Use',
            })
        ).toEqual({
            icon: 'plugin',
            label: 'Computer Use',
        });
        expect(
            getMentionAppearance({
                id: 'app://computer-use/com.google.Chrome',
                kind: 'app',
                label: 'Chrome',
            })
        ).toEqual({
            brandColor: 'var(--success)',
            icon: 'chrome',
            label: 'Chrome',
        });
        expect(
            getMentionDisplayLabel({
                id: 'app://computer-use/net.imput.helium',
                kind: 'app',
                label: 'Helium',
            })
        ).toBe('Helium');
    });

    it('uses native app icons when app metadata includes one', () => {
        expect(
            getMentionAppearance({
                id: 'app://computer-use/net.imput.helium',
                kind: 'app',
                label: 'Helium',
                metadata: {
                    iconDataUrl: 'data:image/png;base64,abc',
                },
            })
        ).toEqual({
            icon: 'plugin',
            iconDataUrl: 'data:image/png;base64,abc',
        });
    });

    it('renders agent mentions with avatar metadata as the agent avatar', () => {
        expect(
            getMentionAppearance({
                id: 'agent://agt_blippy',
                kind: 'agent',
                label: 'blippy',
                metadata: {
                    agentAvatarUrl: '/api/avatars/avt_0123456789abcdef',
                    agentDisplayName: 'Blippy',
                },
            })
        ).toEqual({
            agentAvatar: { name: 'Blippy', src: '/api/avatars/avt_0123456789abcdef' },
            icon: 'agent',
            label: 'Blippy',
        });
    });

    it('falls back to initials and preserves agent appearance metadata', () => {
        expect(
            getMentionAppearance({
                id: 'agent://agt_plain',
                kind: 'agent',
                label: 'Plain',
                metadata: { agentColor: '#f97316' },
            })
        ).toEqual({
            agentAvatar: { name: 'Plain', src: null },
            brandColor: '#f97316',
            icon: 'agent',
        });
    });

    it('keeps path mentions consistent', () => {
        expect(
            getMentionAppearance({
                id: '/Users/zknicker/.codex/worktrees/1b41/haus/specs/mentions.md',
                kind: 'file',
                label: 'mentions.md',
            })
        ).toEqual({
            icon: 'file',
        });
    });
});
