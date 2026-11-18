import { listServerMembersInputSchema, serverMemberDirectorySchema } from '@haus/api';
import { listServerMembers } from '../../servers/list-members.ts';
import { serverMemberProcedure } from './procedure.ts';

export const listMembersProcedure = serverMemberProcedure
    .input(listServerMembersInputSchema)
    .output(serverMemberDirectorySchema)
    .query(
        async ({ ctx, input }) => await listServerMembers(ctx.hausDb, ctx.member, input.serverId)
    );
