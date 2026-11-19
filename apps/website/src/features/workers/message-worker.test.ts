import { expect, test } from 'bun:test';
import { formatWorkerLink } from '@haus/api';
import { linkedMessage, linkedWork } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { workerDisplayContent, messageWorker } from './message-worker.ts';

const other = { ...linkedWork, id: 'caw_other', title: 'Second job' };
const otherLink = formatWorkerLink(other.title, other.id);
const ownLink = formatWorkerLink(linkedWork.title, linkedWork.id);

test('a Message shows every work it links, in link order', () => {
    expect(messageWorker(linkedMessage)).toEqual([linkedWork]);
    expect(messageWorker({ ...linkedMessage, workers: [other, linkedWork] })).toEqual([
        other,
        linkedWork,
    ]);
    expect(messageWorker({ ...linkedMessage, workers: [] })).toEqual([]);
});

test('a closing paragraph of backed links is left out; the words before it stay', () => {
    expect(workerDisplayContent(linkedMessage.content, [linkedWork])).toBe(
        'On it, sending this to a Worker.'
    );
    expect(workerDisplayContent(`Both:\n\n${ownLink} ${otherLink}\n`, [linkedWork, other])).toBe(
        'Both:'
    );
    expect(workerDisplayContent(ownLink, [linkedWork])).toBe('');
});

test('a forged or unrecorded link keeps the paragraph visible', () => {
    const forged = formatWorkerLink('Looks real', 'caw_forged');
    const content = `Hidden?\n\n${forged}`;
    expect(workerDisplayContent(content, [linkedWork])).toBe(content);
    const mixed = `Hidden?\n\n${ownLink} ${forged}`;
    expect(workerDisplayContent(mixed, [linkedWork])).toBe(mixed);
    expect(workerDisplayContent(linkedMessage.content, [])).toBe(linkedMessage.content);
});

test('a paragraph with words or other links beside the work link stays', () => {
    const withWords = `Intro\n\nSee ${ownLink} for status`;
    expect(workerDisplayContent(withWords, [linkedWork])).toBe(withWords);
    const withChat = `Intro\n\n${ownLink} [#ops](chat://cht_ops)`;
    expect(workerDisplayContent(withChat, [linkedWork])).toBe(withChat);
    const inline = `Started ${ownLink} just now.`;
    expect(workerDisplayContent(inline, [linkedWork])).toBe(inline);
});
