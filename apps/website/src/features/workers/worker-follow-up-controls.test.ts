import { expect, test } from 'bun:test';
import { workerFollowUpControls } from './worker-follow-up-controls.ts';

const live = { canStop: true, draft: '', sending: false, stopHeld: false };

test('an empty field on a live turn offers Stop', () => {
    expect(workerFollowUpControls(live)).toEqual({
        label: 'Stop Worker',
        sendDisabled: false,
        status: 'streaming',
        stops: true,
    });
});

test('a send in flight never turns the button into Stop', () => {
    expect(workerFollowUpControls({ ...live, draft: 'Match iPhone.', sending: true })).toEqual({
        label: 'Send follow-up',
        sendDisabled: true,
        status: 'submitted',
        stops: false,
    });
    expect(workerFollowUpControls({ ...live, sending: true }).stops).toBe(false);
});

test('right after a send the cleared field stays a disabled Send until the person types', () => {
    expect(workerFollowUpControls({ ...live, stopHeld: true })).toEqual({
        label: 'Send follow-up',
        sendDisabled: true,
        status: 'ready',
        stops: false,
    });
});

test('typed text sends, and an empty field with nothing to stop is disabled', () => {
    expect(workerFollowUpControls({ ...live, draft: 'Match iPhone.' }).stops).toBe(false);
    expect(workerFollowUpControls({ ...live, canStop: false })).toEqual({
        label: 'Send follow-up',
        sendDisabled: true,
        status: 'ready',
        stops: false,
    });
});
