import { modelSignInSchema, modelSignInTargetInputSchema } from '@haus/api';
import { modelConnectionProcedure } from './procedure.ts';

export const modelSignInProcedure = modelConnectionProcedure
    .input(modelSignInTargetInputSchema)
    .output(modelSignInSchema)
    .query(({ ctx, input }) => ctx.modelConnections.readSignIn(ctx.member, input));
