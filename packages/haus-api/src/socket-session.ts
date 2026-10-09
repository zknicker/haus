import * as z from 'zod';

/**
 * Re-authenticates the App's open Server WebSocket in place with a rotated
 * Clerk session token (docs/api/auth.md, "Socket sessions"). Only valid over
 * that socket, and only for the Clerk user and session the socket is bound to;
 * any refusal tells the App to reconnect instead.
 */
export const socketSessionRefreshInputSchema = z.object({
    clerkSessionToken: z.string().min(1),
});

export const socketSessionRefreshResultSchema = z.object({ ok: z.literal(true) });

export type SocketSessionRefreshInput = z.infer<typeof socketSessionRefreshInputSchema>;
