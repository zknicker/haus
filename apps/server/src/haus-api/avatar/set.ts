import { avatarSchema, setAvatarInputSchema } from '@haus/api';
import { setAvatar } from '../../avatars/set-avatar.ts';
import { avatarProcedure } from './procedure.ts';

export const setAvatarProcedure = avatarProcedure
    .input(setAvatarInputSchema)
    .output(avatarSchema)
    .mutation(async ({ ctx, input }) => await setAvatar(ctx.hausDb, ctx.member, input));
