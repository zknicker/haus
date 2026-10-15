import { hostedConnectorUrl } from './catalog.ts';
import type { HostedMcpAccess } from './supervisor.ts';

/**
 * Only catalog-selected connections reach private sockets; user URLs never
 * select a process. Every request must name the connector's own logical URL.
 */
export function hostedMcpFetch(hosted: HostedMcpAccess | undefined, id: string): typeof fetch {
    const connectorUrl = hostedConnectorUrl(id);
    return Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : input);
            if (!(hosted && connectorUrl) || url.href !== connectorUrl) {
                throw new Error('Hosted MCP transport is unavailable.');
            }
            if (input instanceof Request) {
                throw new Error('Hosted MCP transport requires explicit request options.');
            }
            return await hosted.request(id, '/mcp', init);
        },
        { preconnect: fetch.preconnect }
    );
}
