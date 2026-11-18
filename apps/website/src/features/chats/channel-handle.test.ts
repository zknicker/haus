import { expect, test } from 'bun:test';
import { channelHandleIssue, isValidChannelHandle } from './channel-handle.ts';

test('accepts handles the runtime accepts', () => {
    expect(isValidChannelHandle('planning')).toBe(true);
    expect(isValidChannelHandle('launches-2026')).toBe(true);
    expect(isValidChannelHandle('a_b')).toBe(true);
    expect(isValidChannelHandle('a'.repeat(32))).toBe(true);
});

test('rejects spaces, leading punctuation, and over-long handles', () => {
    expect(isValidChannelHandle('new channel')).toBe(false);
    expect(isValidChannelHandle('-planning')).toBe(false);
    expect(isValidChannelHandle('#planning')).toBe(false);
    expect(isValidChannelHandle('')).toBe(false);
    expect(isValidChannelHandle('a'.repeat(33))).toBe(false);
});

test('stays silent until an invalid name is actually typed', () => {
    expect(channelHandleIssue('')).toBeNull();
    expect(channelHandleIssue('   ')).toBeNull();
    expect(channelHandleIssue(' planning ')).toBeNull();
    expect(channelHandleIssue('new channel')).toContain('single handles');
});
