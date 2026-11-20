import { modelSignInSchema, modelSignInStartInputSchema } from '@haus/api';
import { modelConnectionProcedure } from './procedure.ts';

export const startModelSignInProcedure = modelConnectionProcedure
    .input(modelSignInStartInputSchema)
    .output(modelSignInSchema)
    .mutation(({ ctx, input }) => ctx.modelConnections.startSignIn(ctx.member, input));
