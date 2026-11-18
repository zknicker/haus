import { avatarSchema, clearAvatarInputSchema } from '@haus/api';
import { clearAvatar } from '../../avatars/set-avatar.ts';
import { avatarProcedure } from './procedure.ts';

export const clearAvatarProcedure = avatarProcedure
    .input(clearAvatarInputSchema)
    .output(avatarSchema)
    .mutation(async ({ ctx, input }) => await clearAvatar(ctx.hausDb, ctx.member, input));
