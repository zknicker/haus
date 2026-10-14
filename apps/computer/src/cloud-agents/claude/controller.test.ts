import { expect, test } from 'bun:test';
import { parseClaudeControllerEvent } from './controller.ts';

test('native task notifications encode completed, failed and stopped as terminal', () => {
    for (const status of ['completed', 'failed', 'stopped']) {
        expect(
            parseClaudeControllerEvent({
                sequence_num: '42',
                payload: {
                    type: 'system',
                    subtype: 'task_notification',
                    uuid: 'event',
                    task_id: 'task',
                    status,
                },
            }).task
        ).toEqual({ id: 'task', terminal: true });
    }
    expect(
        parseClaudeControllerEvent({
            sequence_num: '41',
            payload: {
                type: 'system',
                subtype: 'task_started',
                uuid: 'event',
                task_id: 'task',
            },
        }).task
    ).toEqual({ id: 'task', terminal: false });
});

test('only native textual user messages carry the scoped work/run marker', () => {
    const event = parseClaudeControllerEvent({
        sequence_num: '42',
        payload: {
            type: 'user',
            uuid: 'native_prompt',
            message: { content: 'HAUS_CLOUD_RUN=caw_one/car_two\nDo work' },
        },
    });
    expect(event).toMatchObject({
        promptId: 'native_prompt',
        workRun: { workId: 'caw_one', runId: 'car_two' },
    });
    expect(
        parseClaudeControllerEvent({
            sequence_num: '43',
            payload: {
                type: 'user',
                uuid: 'tool_reply',
                message: { content: [{ type: 'tool_result', content: 'answer' }] },
            },
        }).promptId
    ).toBeUndefined();
});

test('unrelated control responses cannot masquerade as an interrupt receipt', () => {
    expect(
        parseClaudeControllerEvent({
            sequence_num: '44',
            payload: {
                type: 'control_response',
                uuid: 'commands',
                response: {
                    request_id: 'other',
                    subtype: 'success',
                    response: { commands: [] },
                },
            },
        })
    ).toMatchObject({ requestId: 'other', success: true });
    expect(
        parseClaudeControllerEvent({
            sequence_num: '44',
            payload: {
                type: 'control_response',
                uuid: 'commands',
                response: {
                    request_id: 'other',
                    subtype: 'success',
                    response: { commands: [] },
                },
            },
        }).stillQueued
    ).toBeUndefined();
});

test('native task completion replay is execution evidence, not a newer human prompt', () => {
    expect(
        parseClaudeControllerEvent({
            sequence_num: '45',
            payload: {
                type: 'user',
                uuid: 'notification',
                origin: { kind: 'task-notification' },
                message: { content: '<task-notification>stopped</task-notification>' },
            },
        }).promptId
    ).toBeUndefined();
});
