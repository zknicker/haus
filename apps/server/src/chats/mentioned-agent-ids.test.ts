import { expect, test } from 'bun:test';
import { formatAgentReferenceTarget, formatCloudAgentWorkLink } from '@haus/api';
import { mentionedAgentIds } from './reply-subscriptions.ts';

const agents = [
    { handle: 'orbit', id: 'agt_orbit' },
    { handle: 'forge', id: 'agt_forge' },
];

test('a plain @handle in the words mentions that Agent', () => {
    expect(mentionedAgentIds('Over to you @orbit.', agents)).toEqual(new Set(['agt_orbit']));
});

test('a Cloud Agent work link label never mentions the handle it names', () => {
    const link = formatCloudAgentWorkLink(
        'Ask @orbit about the flaky test',
        'caw_0123456789abcdef'
    );

    expect(mentionedAgentIds(`Handing this off.\n\n${link}`, agents)).toEqual(new Set());
    expect(mentionedAgentIds(`@forge see ${link}`, agents)).toEqual(new Set(['agt_forge']));
});

test('an Agent link counts by its target, not by its label', () => {
    const content = `[@forge](${formatAgentReferenceTarget('agt_orbit')}) take a look`;

    expect(mentionedAgentIds(content, agents)).toEqual(new Set(['agt_orbit']));
});
