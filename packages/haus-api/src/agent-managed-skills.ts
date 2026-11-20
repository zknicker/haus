import * as z from 'zod';

const managedSkillReleasesSchema = z.record(
    z.string().trim().min(1).max(128),
    z.string().regex(/^[a-f0-9]{64}$/u)
);

/**
 * `GET /api/agent/managed-skills/notice`: the managed skills Haus updated in the caller's Drive
 * area that no completed turn has announced yet, each by the release that updated it.
 */
export const agentManagedSkillNoticeSchema = z
    .object({ pending: managedSkillReleasesSchema })
    .strict();

export type AgentManagedSkillNotice = z.infer<typeof agentManagedSkillNoticeSchema>;

/**
 * `POST /api/agent/managed-skills/notice/ack`, after a completed turn carried the notice. Only
 * the releases it names clear, so an update that landed since stays pending.
 */
export const agentManagedSkillNoticeAckSchema = z
    .object({ announced: managedSkillReleasesSchema })
    .strict();
