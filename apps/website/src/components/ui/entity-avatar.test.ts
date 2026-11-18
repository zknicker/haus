import { describe, expect, test } from 'bun:test';
import { avatarVariants } from '@heroui/styles';

describe('HeroUI avatar variants', () => {
    test('keep each rendered size isolated from later avatar instances', () => {
        const smallAvatar = avatarVariants({ size: 'sm' });
        const largeAvatar = avatarVariants({ size: 'lg' });

        expect(smallAvatar.base()).toContain('avatar--sm');
        expect(smallAvatar.base()).not.toContain('avatar--lg');
        expect(largeAvatar.base()).toContain('avatar--lg');
        expect(largeAvatar.base()).not.toContain('avatar--sm');
    });
});
