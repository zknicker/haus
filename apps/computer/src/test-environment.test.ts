import { expect, test } from 'bun:test';

test('Computer tests never scan this machine’s runtime transcripts for usage', () => {
    expect(process.env.HAUS_COMPUTER_USAGE_DISABLED).toBe('1');
});
