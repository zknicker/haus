import { changeServerMemberRoleInputSchema, serverMemberSchema } from '@haus/api';
import { memberUpdatedTopic } from '../../realtime/topics.ts';
import { changeServerMemberRole } from '../../servers/change-member-role.ts';
import { serverMemberProcedure } from './procedure.ts';

export const changeMemberRoleProcedure = serverMemberProcedure
    .input(changeServerMemberRoleInputSchema)
    .output(serverMemberSchema)
    .mutation(async ({ ctx, input }) => {
        const member = await changeServerMemberRole(ctx.hausDb, ctx.member, input);

        memberUpdatedTopic.announce({ memberId: input.userId, serverId: input.serverId });
        return member;
    });
