import { expect, test } from 'bun:test';
import { resolveManualTopic, searchManualTopics } from './index.ts';

test('the connection topic turns MCP_DENIED into an ask and teaches the connection admin commands', () => {
    const topic = resolveManualTopic('connections');
    expect(topic?.id).toBe('connection');
    expect(topic?.body).toContain('fails with `MCP_DENIED`');
    expect(topic?.body).toContain('or an Agent they made a connection admin');
    for (const command of [
        'haus connection list',
        'haus connection grant --agent <agent> --connection <connection>',
        'haus connection revoke --agent <agent> --connection <connection>',
    ]) {
        expect(topic?.body).toContain(command);
    }
    expect(topic?.body).toContain('CONNECTION_ADMIN_REQUIRED');
    expect(topic?.body).toContain('only a human can grant or remove the connection admin role');
    expect(
        searchManualTopics('grant another agent access to a connection', {
            limit: 5,
            scope: 'all',
        }).map(({ id }) => id)
    ).toContain('connection');
});
