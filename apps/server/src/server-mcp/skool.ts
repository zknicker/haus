import { randomUUID } from 'node:crypto';
import {
    mcpBearerTokenSchema,
    mcpConnectionCreateSchema,
    type skoolConnectSchema,
} from '@haus/api';
import * as z from 'zod';
import { skoolHostedUrl } from '../hosted-mcp/catalog.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireAdmin, requireOperableConnection } from './connection-access.ts';
import { McpDeniedError } from './errors.ts';
import type { McpIconResolver } from './icons.ts';
import type { McpRuntime } from './runtime.ts';
import { createMcpConnection, saveMcpHeaders } from './service.ts';

export async function connectSkool(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: z.infer<typeof skoolConnectSchema>
) {
    await requireAdmin(db, member, input.serverId, 'connect Skool');
    const existing = input.connectionId
        ? await requireOperableConnection(db, member, {
              connectionId: input.connectionId,
              serverId: input.serverId,
          })
        : null;
    if (existing && existing.preset !== 'skool') {
        throw new McpDeniedError('This is not a Skool connection.');
    }
    const url = skoolHostedUrl;
    const hosted = runtime.hostedMcps;
    if (!hosted) {
        throw new McpDeniedError('Skool is unavailable on this Haus Server.');
    }
    const connectionInput = mcpConnectionCreateSchema.parse({
        serverId: input.serverId,
        name: 'Skool',
        url,
        auth: 'headers',
        headers: {},
        oauthScopes: [],
    });
    if (existing && existing.url !== url) {
        throw new McpDeniedError(
            'This Skool connection uses a different service. Add a new connection.'
        );
    }
    const key = randomUUID();
    try {
        const response = await hosted
            .request('skool', '/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key, session: input.session }),
                signal: AbortSignal.timeout(30_000),
                redirect: 'error',
            })
            .catch(() => {
                throw new Error('Could not reach the Skool sign-in service. Try again.');
            });
        if (!response.ok) {
            throw new Error('Skool sign-in could not be verified. Try signing in again.');
        }
        const { bearerToken } = z
            .object({ bearerToken: mcpBearerTokenSchema })
            .strict()
            .parse(await response.json());
        const headers = { Authorization: `Bearer ${bearerToken}` };
        return existing
            ? await saveMcpHeaders(db, runtime, resolveIcon, existing, headers)
            : await createMcpConnection(
                  db,
                  runtime,
                  resolveIcon,
                  member,
                  { ...connectionInput, headers },
                  'skool'
              );
    } catch {
        const cleanup = await hosted
            .request('skool', `/accounts/${key}`, {
                method: 'DELETE',
                signal: AbortSignal.timeout(5000),
                redirect: 'error',
            })
            .catch(() => {
                throw new Error(
                    'Skool setup failed and its temporary account could not be removed.'
                );
            });
        if (!cleanup.ok) {
            throw new Error('Skool setup failed and its temporary account could not be removed.');
        }
        throw new Error('Could not finish connecting Skool. Try again.');
    }
}
