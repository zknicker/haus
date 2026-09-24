import { expect, test } from 'bun:test';
import type { AgentActivityCategory } from '@haus/api';
import {
    admitChatTypingLaunch,
    chatTypingLaunchCap,
    isEngagedActivity,
    planChatTypingLaunch,
    resolveChatTypingFace,
} from './chat-typing-launch.ts';

test.each([
    ['thinking', '🤔'],
    ['reading_files', '🧐'],
    ['searching_web', '🤓'],
    ['browsing', '🫣'],
    ['editing_files', '😤'],
    ['running_command', '🫡'],
    ['using_tool', '🙂‍↕️'],
    ['checking_messages', '😯'],
] as const)('a started %s launches %s', (category, face) => {
    expect(resolveChatTypingFace({ category, phase: 'started' })).toBe(face);
});

const unmapped: AgentActivityCategory[] = [
    'starting_work',
    'working',
    'sending_message',
    'updating_instructions',
    'received_message',
];
test.each(unmapped)('a started %s launches nothing', (category) => {
    expect(resolveChatTypingFace({ category, phase: 'started' })).toBeNull();
});

test('only the start of work launches; any failure launches the dizzy face', () => {
    expect(resolveChatTypingFace({ category: 'thinking', phase: 'completed' })).toBeNull();
    expect(resolveChatTypingFace({ category: 'thinking', phase: 'interrupted' })).toBeNull();
    expect(resolveChatTypingFace({ category: 'running_command', phase: 'failed' })).toBe('😵‍💫');
    expect(resolveChatTypingFace({ category: 'working', phase: 'failed' })).toBe('😵‍💫');
});

test('an activity launches only from the run engaging this Chat', () => {
    const engagements = [{ agentId: 'agt_juniper', runId: 'run_here' }];
    expect(isEngagedActivity(engagements, { agentId: 'agt_juniper', runId: 'run_here' })).toBe(
        true
    );
    expect(isEngagedActivity(engagements, { agentId: 'agt_juniper', runId: 'run_other' })).toBe(
        false
    );
    expect(isEngagedActivity(engagements, { agentId: 'agt_cove', runId: 'run_here' })).toBe(false);
    expect(isEngagedActivity([], { agentId: 'agt_juniper', runId: 'run_here' })).toBe(false);
});

test('launches are throttled to one per 350ms and extras are dropped', () => {
    const idle = { inFlight: 0, lastLaunchAt: null };
    expect(admitChatTypingLaunch(idle, 1000, '🤔')).toBe(true);
    const recent = { inFlight: 1, lastLaunchAt: 1000 };
    expect(admitChatTypingLaunch(recent, 1349, '🧐')).toBe(false);
    expect(admitChatTypingLaunch(recent, 1350, '🧐')).toBe(true);
});

test('sent and failed faces skip the throttle but not the in-flight cap', () => {
    const recent = { inFlight: 1, lastLaunchAt: 1000 };
    expect(admitChatTypingLaunch(recent, 1001, '😊')).toBe(true);
    expect(admitChatTypingLaunch(recent, 1001, '😵‍💫')).toBe(true);
    const full = { inFlight: chatTypingLaunchCap, lastLaunchAt: 0 };
    expect(admitChatTypingLaunch(full, 5000, '🤔')).toBe(false);
    expect(admitChatTypingLaunch(full, 5000, '😊')).toBe(false);
});

test('a launch arcs within its ranges and mostly flips direction', () => {
    const low = planChatTypingLaunch(1, () => 0);
    expect(low).toEqual({ dx: -8, durationMs: 900, rise: 42, rotate: -6 });
    const high = planChatTypingLaunch(1, () => 0.999_999);
    expect(high.dx).toBeCloseTo(24);
    expect(high.rise).toBeCloseTo(70);
    expect(high.rotate).toBeCloseTo(16);
    expect(high.durationMs).toBeCloseTo(1100);
});
