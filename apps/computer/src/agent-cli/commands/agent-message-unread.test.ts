import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { AgentCliMessage } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { formatHistoryLine } from '../agent-format.ts';
import { renderHistory } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import { runRead } from './agent-message.ts';

const baseHistory = {
    has_more: false,
    has_newer: false,
    has_older: true,
    last_read: { after: 10, unread_after: 10 },
    messages: [] as AgentCliMessage[],
    target: '#wg-ax:b365e91f',
    thread_follow_reactivated_message_ids: [],
};

test('message read --unread asks the Server for unread and prints the same command to continue', async () => {
    const messages = [message('msg_three', 11), message('msg_four', 12)];
    const { output, queries } = await read(
        { ...baseHistory, has_newer: true, messages, read_through_seq: 12, unread_after_seq: 10 },
        { '--target': '#wg-ax:b365e91f' }
    );
    expect(queries[0]?.unread).toBe('true');
    expect(output).toBe(
        [
            'Unread window: 2 returned, seq 11-12, oldest to newest, starting after your read position (seq 10).',
            '',
            formatHistoryLine(messages[0] as AgentCliMessage),
            formatHistoryLine(messages[1] as AgentCliMessage),
            '',
            'Read position: seq 10 → 12. To re-read these: haus message read --target "#wg-ax:b365e91f" --after 10',
            'More unread remain. Next: haus message read --target "#wg-ax:b365e91f" --unread',
            '',
        ].join('\n')
    );
});

test('message read --unread ends the window when nothing more is unread', async () => {
    const { output } = await read(
        {
            ...baseHistory,
            messages: [message('msg_only', 11)],
            read_through_seq: 11,
            unread_after_seq: 10,
        },
        { '--target': '#general' }
    );
    expect(output).toContain('Unread window: 1 returned, seq 11, oldest to newest');
    expect(output).toEndWith(
        'Read position: seq 10 → 11. To re-read these: haus message read --target "#general" --after 10\nNo more unread in this target.\n'
    );
});

test('message read --unread with nothing unread says where the read position is', async () => {
    const { output } = await read(
        { ...baseHistory, read_through_seq: 12, unread_after_seq: 12 },
        { '--target': '#general' }
    );
    expect(output).toBe('No unread messages in #general. You have read through seq 12.\n');
});

test('message read --unread fails closed on a Server that ignored the flag', async () => {
    const { error, output } = await read(
        { ...baseHistory, messages: [message('msg_latest', 40)] },
        { '--target': '#general' }
    );
    expect(output).toBe('');
    expect(error?.code).toBe('UNSUPPORTED_BY_SERVER');
    expect(error?.message).toBe(
        'This Server does not support --unread yet, so the page it returned was discarded instead of being shown as unread.'
    );
    expect(error?.options.nextAction).toBe(
        'haus inbox check (each row prints the read command for that conversation)'
    );
});

test('message read --unread refuses an anchor before calling the Server', async () => {
    for (const anchor of ['--before', '--after', '--around']) {
        const { error, queries } = await read(baseHistory, {
            '--target': '#general',
            [anchor]: '5',
        });
        expect(queries).toEqual([]);
        expect(error?.code).toBe('INVALID_ARG');
        expect(error?.message).toBe(
            '--unread cannot be combined with --before, --after, or --around: it always starts right after your read position.'
        );
        expect(error?.options.nextAction).toBe('haus message read --target "#general" --unread');
    }
});

test('plain history names the real read position only for an unanchored read', () => {
    const history = { ...baseHistory, messages: [message('msg_one', 11)], target: '#general' };
    expect(renderHistory(history).split('\n')[1]).toBe(
        'Server unread cursor before this read: seq 10. Use haus message read --target "#general" --after 10 to browse newer messages.'
    );
    expect(renderHistory(history, { anchored: true })).not.toContain('unread cursor');
    expect(renderHistory({ ...history, last_read: { after: 0, unread_after: 0 } })).not.toContain(
        'unread cursor'
    );
});

async function read(
    body: unknown,
    values: Record<string, string>
): Promise<{
    error: AgentCliError | null;
    output: string;
    queries: Record<string, unknown>[];
}> {
    const queries: Record<string, unknown>[] = [];
    let output = '';
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>, input?: AgentApiRequest) => {
            queries.push(input?.query ?? {});
            return schema.parse(body);
        },
    };
    const args: ParsedArgs = {
        flags: { '--unread': true },
        help: false,
        positionals: [],
        values,
    };
    try {
        await runRead(args, {
            client,
            mintNonce: () => 'nonce',
            readStdin: async () => '',
            stdinIsTty: false,
            write: (text) => {
                output += text;
            },
        });
        return { error: null, output, queries };
    } catch (error) {
        if (!(error instanceof AgentCliError)) {
            throw error;
        }
        return { error, output, queries };
    }
}

function message(id: string, sequence: number): AgentCliMessage {
    return {
        attachments: [],
        author: { id: 'usr_operator', kind: 'user', label: 'Operator', metadata: {} },
        body_kind: 'text',
        chat_id: 'chat_messages',
        content: `body-${id}`,
        created_at: `2026-08-17T12:00:${String(sequence).padStart(2, '0')}.000Z`,
        deleted_at: null,
        delivery_id: null,
        id,
        metadata: {},
        nonce: null,
        role: 'user',
        sender: { description: null, handle: 'operator', type: 'human' },
        sequence,
    };
}
