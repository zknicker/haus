import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * A stand-in `claude` for driver tests: speaks the stream-json shapes the fixtures recorded.
 * Prompts: `crash` exits mid-turn, `slow` runs a tool until interrupted, `hold` waits for a
 * steer that then runs past its result, anything else echoes.
 * Each launch appends its argv and env facts to `FAKE_CLAUDE_LOG`.
 */
const args = process.argv.slice(2);
const flag = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};
const sessionId = flag('--resume') ?? flag('--session-id') ?? 'no-session';
const log = process.env.FAKE_CLAUDE_LOG;
if (log) {
    appendFileSync(
        log,
        `${JSON.stringify({
            args,
            env: {
                CLAUDECODE: process.env.CLAUDECODE ?? null,
                CLAUDE_CODE_DISABLE_BACKGROUND_TASKS:
                    process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS,
                HOME: process.env.HOME,
                hasHostToolToken: Boolean(process.env.HAUS_HOST_TOOLS_TOKEN),
            },
            pid: process.pid,
        })}\n`
    );
}

const print = (message: Record<string, unknown>) =>
    process.stdout.write(`${JSON.stringify({ session_id: sessionId, ...message })}\n`);
const result = (fields: Record<string, unknown>) =>
    print({
        is_error: false,
        subtype: 'success',
        type: 'result',
        usage: { input_tokens: 5, output_tokens: 2 },
        ...fields,
    });

if (flag('--resume')?.startsWith('missing')) {
    process.stderr.write(`No conversation found with session ID: ${sessionId}\n`);
    result({
        errors: [`No conversation found with session ID: ${sessionId}`],
        is_error: true,
        subtype: 'error_during_execution',
    });
    process.exit(1);
}

let slowTurn = false;
let holding = false;
for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line) as {
        message?: { content?: { text?: string }[] };
        priority?: string;
        request?: { subtype?: string };
        request_id?: string;
        type: string;
        uuid?: string;
    };
    if (message.type === 'control_request') {
        print({
            response: { request_id: message.request_id, response: {}, subtype: 'success' },
            type: 'control_response',
        });
        if (message.request?.subtype === 'interrupt' && slowTurn) {
            slowTurn = false;
            result({ errors: ['interrupted'], is_error: true, subtype: 'error_during_execution' });
        }
        continue;
    }
    const text = message.message?.content?.[0]?.text ?? '';
    if (message.priority === 'next' && message.uuid) {
        print({ command_uuid: message.uuid, state: 'queued', type: 'command_lifecycle' });
        if (holding) {
            // Queued past the running turn's end: it runs as one more result.
            holding = false;
            result({ result: 'first' });
            print({ command_uuid: message.uuid, state: 'started', type: 'command_lifecycle' });
            result({ result: 'second', user_message_uuid: message.uuid });
        }
        print({ command_uuid: message.uuid, state: 'completed', type: 'command_lifecycle' });
        continue;
    }
    print({ capabilities: ['msg_lifecycle_v1'], subtype: 'init', type: 'system' });
    if (text === 'hold') {
        holding = true;
        continue;
    }
    if (text === 'crash') {
        process.stderr.write('boom\n');
        process.exit(3);
    }
    if (text === 'slow') {
        slowTurn = true;
        print({
            message: {
                content: [
                    {
                        id: 'toolu_slow',
                        input: { command: 'sleep 60' },
                        name: 'Bash',
                        type: 'tool_use',
                    },
                ],
            },
            parent_tool_use_id: null,
            type: 'assistant',
        });
        continue;
    }
    print({
        event: { content_block: { type: 'text' }, index: 0, type: 'content_block_start' },
        type: 'stream_event',
    });
    print({
        event: {
            delta: { text: `echo: ${text}`, type: 'text_delta' },
            index: 0,
            type: 'content_block_delta',
        },
        type: 'stream_event',
    });
    print({ event: { index: 0, type: 'content_block_stop' }, type: 'stream_event' });
    result({ result: `echo: ${text}` });
}
