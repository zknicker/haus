import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A granted Agent reads a real private Skool post through the hosted worker service and cites its URL.',
    name: 'hosted-skool-lookup',
    optIn: true,
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        const credentialPath = path.join(
            homedir(),
            '.local/share/haus-hosted-mcp/skool-connection.json'
        );
        const config = JSON.parse(await readFile(credentialPath, 'utf8'));
        const statusUrl = config.url.replace(/\/mcp$/u, '/status');
        const status = async () => {
            const response = await fetch(statusUrl, { headers: config.headers });
            if (!response.ok) {
                throw new Error(`Hosted MCP status failed: ${response.status}`);
            }
            return response.json();
        };
        const call = async (name, arguments_) => {
            const response = await fetch(config.url, {
                body: JSON.stringify({
                    id: 1,
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: { arguments: arguments_, name },
                }),
                headers: {
                    ...config.headers,
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                },
                method: 'POST',
            });
            const payload = await response.json();
            if (!response.ok || payload.error || payload.result?.isError) {
                throw new Error(
                    'Hosted Skool baseline read failed; reconnect before running this scenario.'
                );
            }
            return JSON.parse(payload.result.content[0].text);
        };
        const communities = await call('skool_list_communities', {});
        expect(communities.length > 0, 'account has a joined community').toBe(true);
        let fixture = null;
        for (const community of communities) {
            const posts = await call('skool_list_posts', {
                community_slug: community.slug,
                limit: 1,
            });
            if (posts.length > 0) {
                fixture = { community, post: posts[0] };
                break;
            }
        }
        expect(Boolean(fixture), 'account has a readable post').toBe(true);
        const { community, post } = fixture;
        const postUrl = `https://www.skool.com/${community.slug}/${post.name}`;
        let connectionId = null;
        try {
            log('connecting the Skool account');
            const connection = await kit.trpc('mcp.add', {
                auth: 'headers',
                headers: config.headers,
                name: `Skool ${kit.stamp}`,
                oauthScopes: [],
                serverId: kit.serverId,
                url: config.url,
            });
            connectionId = connection.id;
            expect(connection.tools, 'scoped post reader discovered').toContain('skool_get_post');
            await kit.trpc('mcp.setGrant', {
                agentId: worker.id,
                connectionId,
                enabled: true,
                serverId: kit.serverId,
            });
            const before = await status();
            const head = await kit.readHead(worker.dmChatId);
            await kit.harness.send(
                worker.dmChatId,
                `Use the assigned Skool MCP to list my communities, then read ${postUrl} from that account. Reply with the exact post title, a brief summary, and a clickable source URL. Discover and invoke the MCP tools. Do not use a browser or guess.`
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'private lookup turn').toBe('completed');
            expect(turn.outputProduced, 'durable reply').toBe(true);
            const page = await kit.trpc('chat.messages', {
                chatId: worker.dmChatId,
                limit: 100,
                serverId: kit.serverId,
            });
            const replies = kit.authoredBy(page.messages, worker.id, head);
            for (const thread of page.threads ?? []) {
                replies.push(
                    ...kit.authoredBy(await kit.readMessages(thread.threadChatId), worker.id)
                );
            }
            expect(replies, 'exact title from the private post').toContain(post.title);
            expect(replies, 'source citation').toContain(postUrl);
            expect((await status()).calls > before.calls, 'Agent invoked the hosted service').toBe(
                true
            );
        } finally {
            if (connectionId) {
                await kit.trpc('mcp.delete', { connectionId, serverId: kit.serverId });
            }
        }
    },
});
