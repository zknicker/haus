import { describe, expect, test } from 'bun:test';
import { channelNoun } from './channel-noun.ts';

describe('channelNoun', () => {
    test('calls #all a channel, never a project', () => {
        expect(channelNoun({ isAll: true })).toEqual({
            label: 'Channel',
            lower: 'channel',
            updated: '#all updated',
        });
    });

    test('calls every other channel a project', () => {
        expect(channelNoun({ isAll: false })).toEqual({
            label: 'Project',
            lower: 'project',
            updated: 'Project updated',
        });
    });
});
