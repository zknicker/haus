import { modelSignInSchema, modelSignInTargetInputSchema } from '@haus/api';
import { modelConnectionProcedure } from './procedure.ts';

export const cancelModelSignInProcedure = modelConnectionProcedure
    .input(modelSignInTargetInputSchema)
    .output(modelSignInSchema)
    .mutation(({ ctx, input }) => ctx.modelConnections.cancelSignIn(ctx.member, input));
