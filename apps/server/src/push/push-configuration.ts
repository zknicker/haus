import { ApnsSender } from './apns-sender.ts';
import type { PushSender } from './push-sender.ts';

const appleTeamIdPattern = /^[A-Z0-9]{10}$/u;

/**
 * iPhone push is optional: without an APNs key the Server runs with push
 * disabled and says so in one startup line. A key that cannot be read, or a
 * malformed team id, also disables push rather than failing boot, and names the reason.
 */
export async function createPushSender(input: {
    keyId: string | undefined;
    privateKey: string | undefined;
    teamId: string | undefined;
}): Promise<{ sender: PushSender | null; status: string }> {
    if (!(input.keyId && input.privateKey)) {
        return { sender: null, status: 'iPhone push disabled: APNs key not configured' };
    }
    if (!input.teamId) {
        return { sender: null, status: 'iPhone push disabled: APPLE_TEAM_ID not configured' };
    }
    if (!appleTeamIdPattern.test(input.teamId)) {
        return {
            sender: null,
            status: 'iPhone push disabled: APPLE_TEAM_ID is not a 10-character Apple team id',
        };
    }
    try {
        const sender = await ApnsSender.create({
            keyId: input.keyId,
            privateKey: input.privateKey,
            teamId: input.teamId,
        });
        return { sender, status: `iPhone push enabled: APNs key ${input.keyId}` };
    } catch (error) {
        const reason = error instanceof Error ? error.name : 'unknown error';
        return { sender: null, status: `iPhone push disabled: APNs key unreadable (${reason})` };
    }
}
