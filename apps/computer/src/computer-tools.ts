import { join } from 'node:path';
import { createBrowserTools } from './browser/agent-tool.ts';
import { createServerMcpTools } from './server-mcp-tools.ts';

export function createComputerTools(input: {
    command: { agentId: string };
    host: { proxyToken: string; proxy: { url: string } };
    options: { dataRoot: string; attachment: { serverId: string } };
}) {
    return {
        ...createServerMcpTools({
            proxyToken: input.host.proxyToken,
            proxyUrl: input.host.proxy.url,
        }),
        ...createBrowserTools({
            agentId: input.command.agentId,
            root: join(
                input.options.dataRoot,
                'servers',
                input.options.attachment.serverId,
                'browser'
            ),
        }),
    };
}
