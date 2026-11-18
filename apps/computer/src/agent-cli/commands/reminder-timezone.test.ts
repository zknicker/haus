import { expect, test } from 'bun:test';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    confirmUpdateTimezone,
    scheduleTimezone,
    verifyScheduledTimezone,
} from './reminder-timezone.ts';

const args = (values: Record<string, string>) => ({ values }) as ParsedArgs;
const client = (supported: boolean) =>
    ({
        request: async (_route, schema) =>
            schema.parse({
                reminders: [],
                supportsReminderTimezone: supported,
            }),
    }) as AgentApiRequester;

test('calendar repeat cannot silently omit its recurrence timezone', async () => {
    const missing = scheduleTimezone(args({ '--repeat': 'weekly:fri@09:00' }), client(true));
    await expect(missing).rejects.toThrow('the IANA zone of the person they are for');
    // The error teaches the lookup, because the Agent has no zone of its own to offer.
    const nextAction = await missing.catch(
        (cause: AgentCliError) => cause.options.nextAction ?? ''
    );
    expect(nextAction).toContain('haus server info --humans --query <handle>');
    expect(nextAction).toContain('ask which one before scheduling');
    expect(await scheduleTimezone(args({ '--repeat': 'every:7d' }), client(false))).toBeUndefined();
});

test('explicit timezone fails before mutation on an old Server and validates IANA zones', async () => {
    const values = { '--repeat': 'weekly:fri@09:00', '--timezone': 'America/New_York' };
    await expect(scheduleTimezone(args(values), client(false))).rejects.toThrow(
        'cannot confirm explicit reminder timezone support'
    );
    expect(await scheduleTimezone(args(values), client(true))).toBe('America/New_York');
    await expect(
        scheduleTimezone(args({ '--timezone': 'Invalid/Zone' }), client(true))
    ).rejects.toThrow('valid IANA');
});

test('calendar updates require confirmation of the unchanged stored zone', () => {
    const current = { timezone: 'UTC' };
    expect(() => confirmUpdateTimezone(args({}), current, 'weekly:fri@09:00')).toThrow();
    expect(() =>
        confirmUpdateTimezone(
            args({ '--timezone': 'America/New_York' }),
            current,
            'weekly:fri@09:00'
        )
    ).toThrow('stored timezone');
    expect(() => confirmUpdateTimezone(args({ '--timezone': 'UTC' }), {}, 'daily@09:00')).toThrow();
    expect(() =>
        confirmUpdateTimezone(args({ '--timezone': 'UTC' }), current, 'daily@09:00')
    ).not.toThrow();
    expect(() =>
        verifyScheduledTimezone('America/New_York', { id: 'rem_1', timezone: 'UTC' })
    ).toThrow('receipt');
    expect(() =>
        verifyScheduledTimezone('America/New_York', { id: 'rem_1', timezone: 'America/New_York' })
    ).not.toThrow();
});

test('a missing capability route is an actionable unsupported result before mutation', async () => {
    const routes: string[] = [];
    const old = {
        request: async (route) => {
            routes.push(route);
            throw new AgentCliError('INVALID_JSON_RESPONSE', 'Old Server 404');
        },
    } as AgentApiRequester;
    await expect(scheduleTimezone(args({ '--timezone': 'America/New_York' }), old)).rejects.toThrow(
        'cannot confirm'
    );
    expect(routes).toEqual(['/api/agent/reminders/capabilities']);
});
