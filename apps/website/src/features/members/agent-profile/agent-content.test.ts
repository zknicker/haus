import { expect, test } from 'bun:test';
import { resolveWorkspaceAvailability } from './agent-content.tsx';

const computers = [{ health: 'healthy' as const, id: 'cmp_1' }];

test('restricts workspace browsing for members regardless of Computer state', () => {
    expect(resolveWorkspaceAvailability({ computerId: 'cmp_1', computers, role: 'member' })).toBe(
        'restricted'
    );
});

test('stays loading until the Computer roster resolves', () => {
    expect(
        resolveWorkspaceAvailability({ computerId: 'cmp_1', computers: undefined, role: 'admin' })
    ).toBe('loading');
});

test('is available once the assigned Computer reports healthy', () => {
    expect(resolveWorkspaceAvailability({ computerId: 'cmp_1', computers, role: 'admin' })).toBe(
        'available'
    );
});

test('degrades instead of hanging when the assigned Computer is offline', () => {
    expect(
        resolveWorkspaceAvailability({
            computerId: 'cmp_1',
            computers: [{ health: 'offline', id: 'cmp_1' }],
            role: 'owner',
        })
    ).toBe('computer-offline');
});

test('degrades when the Agent has no matching Computer in the roster', () => {
    expect(
        resolveWorkspaceAvailability({ computerId: 'cmp_missing', computers, role: 'owner' })
    ).toBe('computer-offline');
});
