import { managedSkillChangeText } from '@haus/agent-prompt';
import { agentManagedSkillNoticeSchema } from '@haus/api';
import type { RunAuthority } from '../run-context.ts';
import { agentGet } from './agent-drive.ts';

export interface ManagedSkillNotice {
    readonly announced: Readonly<Record<string, string>>;
    readonly text: string;
}

export async function readManagedSkillNotice(authority: RunAuthority) {
    const { pending } = agentManagedSkillNoticeSchema.parse(
        await agentGet(authority, '/api/agent/managed-skills/notice', 'the skill update notice')
    );
    const names = Object.keys(pending).sort();
    if (names.length === 0) {
        return null;
    }
    const notice: ManagedSkillNotice = { announced: pending, text: managedSkillChangeText(names) };
    return notice;
}

export async function ackManagedSkillNotice(authority: RunAuthority, notice: ManagedSkillNotice) {
    const response = await fetch(
        new URL('/api/agent/managed-skills/notice/ack', authority.serverUrl),
        {
            body: JSON.stringify({ announced: notice.announced }),
            headers: {
                authorization: `Bearer ${authority.runCredential}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        }
    );
    if (!response.ok) {
        throw new Error(`Sending the skill update receipt failed with HTTP ${response.status}.`);
    }
}
