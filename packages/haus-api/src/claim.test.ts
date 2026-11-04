import { expect, test } from 'bun:test';
import { claimAssigneeRefSchema, claimCreateInputSchema } from './claim.ts';
import { messageClaimSchema } from './claim-shared.ts';

test('claims are held by Agents only', () => {
    expect(claimAssigneeRefSchema.safeParse({ agentId: 'agt_orbit' }).success).toBe(true);
    expect(claimAssigneeRefSchema.safeParse({ kind: 'human', userId: 'usr_ada' }).success).toBe(
        false
    );
    expect(messageClaimSchema.shape).not.toHaveProperty('assigneeUserId');
    expect(
        claimCreateInputSchema.safeParse({
            assigneeUserId: 'usr_ada',
            chatId: 'cht_product',
            content: 'Ship it',
            nonce: 'n1',
            serverId: 'srv_1',
        }).success
    ).toBe(false);
});
