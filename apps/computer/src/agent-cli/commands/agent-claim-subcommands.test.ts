import { afterEach, expect, spyOn, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { dispatchSubcommand } from '../subcommand.ts';
import type { ClaimDeps } from './agent-claim-actions.ts';
import { createClaimSubcommands } from './agent-claim-subcommands.ts';

let restore: (() => void) | null = null;

afterEach(() => {
    restore?.();
    restore = null;
});

test('the bare claim group claims when its first argument is a flag', async () => {
    const routes: string[] = [];
    const bodies: unknown[] = [];
    const exit = await dispatchSubcommand(
        'claim',
        createClaimSubcommands(() => deps(routes, bodies)),
        ['--target', '#general', '--number', '7']
    );

    expect(exit).toBe(0);
    expect(routes).toEqual(['/api/agent/claims/claim']);
    expect(bodies).toEqual([{ messageId: undefined, numbers: [7], target: '#general' }]);
});

test('release is the inverse verb and the old unclaim verb is unknown', async () => {
    const routes: string[] = [];
    const subcommands = createClaimSubcommands(() => deps(routes, []));
    const stderr = captureStderr();

    expect(
        await dispatchSubcommand('claim', subcommands, [
            'release',
            '--target',
            '#general',
            '--number',
            '7',
        ])
    ).toBe(0);
    expect(routes).toEqual(['/api/agent/claims/release']);
    expect(await dispatchSubcommand('claim', subcommands, ['unclaim'])).toBe(2);
    expect(await dispatchSubcommand('claim', subcommands, ['claim'])).toBe(2);
    expect(stderr()).toContain("Unknown claim command 'unclaim'.");
});

function deps(routes: string[], bodies: unknown[]): ClaimDeps {
    const client: AgentApiRequester = {
        request: async <T>(route: string, schema: z.ZodType<T>, input?: { body?: unknown }) => {
            routes.push(route);
            bodies.push(input?.body);
            return schema.parse(
                route.endsWith('/claim')
                    ? {
                          results: [
                              {
                                  claim: claimRow(),
                                  claimConflict: null,
                                  number: 7,
                                  outcome: 'claimed',
                                  reason: null,
                              },
                          ],
                      }
                    : { claim: claimRow() }
            ) as T;
        },
    };
    return {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: () => false,
        write: () => undefined,
    };
}

function claimRow() {
    return {
        assignee: null,
        message: {
            attachments: [],
            author: { id: 'usr_wren', kind: 'user', label: 'wren', metadata: {} },
            body_kind: 'text',
            chat_id: 'cht_general',
            content: 'Audit the Server export',
            created_at: '2026-07-26T20:00:00.000Z',
            deleted_at: null,
            delivery_id: null,
            id: 'msg_1a2b3c4d00000000',
            metadata: {},
            nonce: 'claim-dispatch-test',
            role: 'user',
            sender: { description: null, handle: 'wren', type: 'human' },
            sequence: 1,
        },
        number: 7,
        status: 'todo',
        target: '#general',
        version: 3,
    };
}

function captureStderr(): () => string {
    let output = '';
    const spy = spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        output += String(chunk);
        return true;
    });
    restore = () => spy.mockRestore();
    return () => output;
}
