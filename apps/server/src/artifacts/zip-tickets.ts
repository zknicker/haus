import { randomBytes } from 'node:crypto';
import { type ArtifactZipInput, artifactZipLinkSeconds } from '@haus/api';
import type { ArtifactActor } from './access.ts';

/** What a zip link downloads, and for whom: access is checked again when it is opened. */
export interface ZipTicket {
    actor: ArtifactActor;
    expiresAt: Date;
    selection: Pick<ArtifactZipInput, 'paths' | 'root'>;
}

/** 192 random bits, URL-safe. */
export const zipTicketPattern = /^[\w-]{32}$/u;

/**
 * Short-lived zip download links. A link names a selection, not bytes, so it can be handed to a
 * browser's download manager (or the desktop's system browser) as a plain GET. Links live in
 * this Server process only, like its realtime topics; a restart expires them, and the App asks
 * for a fresh one per download. A link stays valid until it expires, so a download manager's
 * retry still works.
 */
export function createZipTickets(now: () => number = Date.now) {
    const tickets = new Map<string, ZipTicket>();
    const sweep = () => {
        for (const [token, ticket] of tickets) {
            if (ticket.expiresAt.getTime() <= now()) {
                tickets.delete(token);
            }
        }
    };
    return {
        issue(actor: ArtifactActor, selection: ZipTicket['selection']) {
            sweep();
            const token = randomBytes(24).toString('base64url');
            const expiresAt = new Date(now() + artifactZipLinkSeconds * 1000);
            tickets.set(token, { actor, expiresAt, selection });
            return { expiresAt, token };
        },
        /** The live ticket behind `token`, or null for a malformed, unknown, or expired one. */
        read(token: string): ZipTicket | null {
            if (!zipTicketPattern.test(token)) {
                return null;
            }
            const ticket = tickets.get(token);
            if (!ticket || ticket.expiresAt.getTime() <= now()) {
                tickets.delete(token);
                return null;
            }
            return ticket;
        },
    };
}

export type ZipTickets = ReturnType<typeof createZipTickets>;

/** The process's zip links, shared by `artifact.zip` and `GET /artifacts/zip/:token`. */
export const artifactZipTickets = createZipTickets();
