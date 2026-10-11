import { expect, test } from 'bun:test';
import { formatCloudAgentWorkLink } from '@haus/api';
import {
    linkedMessage,
    linkedWork,
} from '../../../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { cloudAgentWorkDisplayContent, messageCloudAgentWork } from './message-cloud-agent-work.ts';

const other = { ...linkedWork, id: 'caw_other', title: 'Second job' };
const otherLink = formatCloudAgentWorkLink(other.title, other.id);
const ownLink = formatCloudAgentWorkLink(linkedWork.title, linkedWork.id);

test('a Message shows every work it links, in link order', () => {
    expect(messageCloudAgentWork(linkedMessage)).toEqual([linkedWork]);
    expect(
        messageCloudAgentWork({ ...linkedMessage, cloudAgentWork: [other, linkedWork] })
    ).toEqual([other, linkedWork]);
    expect(messageCloudAgentWork({ ...linkedMessage, cloudAgentWork: [] })).toEqual([]);
});

test('a retired cloud-agent-work body still shows its work, once', () => {
    const body = { kind: 'cloud-agent-work' as const, work: linkedWork };
    expect(messageCloudAgentWork({ body, cloudAgentWork: [] })).toEqual([linkedWork]);
    expect(messageCloudAgentWork({ body, cloudAgentWork: [linkedWork] })).toEqual([linkedWork]);
    expect(messageCloudAgentWork({ body, cloudAgentWork: [other] })).toEqual([linkedWork, other]);
});

test('a closing paragraph of backed links is left out; the words before it stay', () => {
    expect(cloudAgentWorkDisplayContent(linkedMessage.content, [linkedWork])).toBe(
        'On it, sending this to a Cloud Agent.'
    );
    expect(
        cloudAgentWorkDisplayContent(`Both:\n\n${ownLink} ${otherLink}\n`, [linkedWork, other])
    ).toBe('Both:');
    expect(cloudAgentWorkDisplayContent(ownLink, [linkedWork])).toBe('');
});

test('a forged or unrecorded link keeps the paragraph visible', () => {
    const forged = formatCloudAgentWorkLink('Looks real', 'caw_forged');
    const content = `Hidden?\n\n${forged}`;
    expect(cloudAgentWorkDisplayContent(content, [linkedWork])).toBe(content);
    const mixed = `Hidden?\n\n${ownLink} ${forged}`;
    expect(cloudAgentWorkDisplayContent(mixed, [linkedWork])).toBe(mixed);
    expect(cloudAgentWorkDisplayContent(linkedMessage.content, [])).toBe(linkedMessage.content);
});

test('a paragraph with words or other links beside the work link stays', () => {
    const withWords = `Intro\n\nSee ${ownLink} for status`;
    expect(cloudAgentWorkDisplayContent(withWords, [linkedWork])).toBe(withWords);
    const withChat = `Intro\n\n${ownLink} [#ops](chat://cht_ops)`;
    expect(cloudAgentWorkDisplayContent(withChat, [linkedWork])).toBe(withChat);
    const inline = `Started ${ownLink} just now.`;
    expect(cloudAgentWorkDisplayContent(inline, [linkedWork])).toBe(inline);
});
