import { expect, test } from 'bun:test';
import { connectionAccountLabel } from './connection-list-section.tsx';

test('an account label that only repeats the connection name is not shown', () => {
    expect(connectionAccountLabel({ accountLabel: 'atlas', builtIn: false, name: 'Atlas' })).toBe(
        'Custom'
    );
    expect(
        connectionAccountLabel({ accountLabel: 'atlas', builtIn: false, name: 'MerchBase Atlas' })
    ).toBe('Custom');
    expect(
        connectionAccountLabel({ accountLabel: 'handmade', builtIn: true, name: 'Handmade' })
    ).toBe('Built in');
});

test('a real account label names the account', () => {
    expect(
        connectionAccountLabel({ accountLabel: 'zach@example.com', builtIn: true, name: 'Gmail' })
    ).toBe('zach@example.com');
});
