import { expect, test } from 'bun:test';
import type { AgentActivityCategory } from '@haus/api';
import {
    admitChatTypingLaunch,
    type ChatTypingFace,
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
] as const)('a started %s launches %s', (category, face) => {
    expect(resolveChatTypingFace({ category, phase: 'started' })).toBe(face);
});

const unmapped: AgentActivityCategory[] = [
    'checking_messages',
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

const idle = { inFlight: 0, lastFace: null, lastLaunchAt: null };
const after = (face: ChatTypingFace, at: number) => ({
    inFlight: 1,
    lastFace: face,
    lastLaunchAt: at,
});

test('work faces are throttled to one per 350ms and extras are dropped', () => {
    expect(admitChatTypingLaunch(idle, 1000, '🤔')).toBe(0);
    expect(admitChatTypingLaunch(after('🤔', 1000), 1349, '🧐')).toBeNull();
    expect(admitChatTypingLaunch(after('🤔', 1000), 1350, '🧐')).toBe(0);
});

test('reply, read, and failure faces skip the throttle but wait out a 200ms gap', () => {
    // The spot test's 🫡 then 😵‍💫 310ms later now launches at once…
    expect(admitChatTypingLaunch(after('🫡', 1000), 1310, '😵‍💫')).toBe(0);
    // …and a failure 10ms after a command face waits until 200ms have passed.
    expect(admitChatTypingLaunch(after('🫡', 1000), 1010, '😵‍💫')).toBe(190);
    expect(admitChatTypingLaunch(after('🫡', 1000), 1001, '😊')).toBe(199);
    expect(admitChatTypingLaunch(after('🫡', 1000), 1100, '👀')).toBe(100);
});

test('the same face twice within 350ms is dropped, priority faces included', () => {
    expect(admitChatTypingLaunch(after('😵‍💫', 1000), 1010, '😵‍💫')).toBeNull();
    expect(admitChatTypingLaunch(after('😵‍💫', 1000), 1350, '😵‍💫')).toBe(0);
    expect(admitChatTypingLaunch(after('🫡', 1000), 1200, '🫡')).toBeNull();
});

test('a face scheduled into the future holds back the next one', () => {
    // A failure scheduled for 1200 blocks a work face until 1550.
    expect(admitChatTypingLaunch(after('😵‍💫', 1200), 1300, '🤔')).toBeNull();
    expect(admitChatTypingLaunch(after('😵‍💫', 1200), 1300, '😊')).toBe(100);
});

test('the in-flight cap drops every face', () => {
    const full = { inFlight: chatTypingLaunchCap, lastFace: null, lastLaunchAt: 0 };
    expect(admitChatTypingLaunch(full, 5000, '🤔')).toBeNull();
    expect(admitChatTypingLaunch(full, 5000, '😊')).toBeNull();
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
