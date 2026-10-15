import { describe, expect, test } from 'bun:test';
import { appHistorySteps, pathFromUrl } from './history-steps.ts';

describe('appHistorySteps', () => {
    test('steps through any App page, on any surface', () => {
        const paths = ['/s/haus/chats/c1', '/s/haus/tasks', '/s/haus/artifacts'];
        expect(appHistorySteps(paths, 0)).toEqual({ back: false, forward: true });
        expect(appHistorySteps(paths, 1)).toEqual({ back: true, forward: true });
        expect(appHistorySteps(paths, 2)).toEqual({ back: true, forward: false });
    });

    test('stops at entries outside the App', () => {
        expect(appHistorySteps(['/sign-in', '/s/haus/inbox', null], 1)).toEqual({
            back: false,
            forward: false,
        });
        expect(appHistorySteps(['/', '/s/haus/inbox'], 1).back).toBeFalse();
    });
});

describe('pathFromUrl', () => {
    test('reads the pathname, without search or hash', () => {
        expect(pathFromUrl('https://haus.chat/s/haus/artifacts?folder=a#x')).toBe(
            '/s/haus/artifacts'
        );
        expect(pathFromUrl(null)).toBeNull();
        expect(pathFromUrl('not a url')).toBeNull();
    });
});
