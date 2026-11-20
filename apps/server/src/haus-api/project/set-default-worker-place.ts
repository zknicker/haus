import { projectSetDefaultWorkerPlaceInputSchema, workerPlaceSchema } from '@haus/api';
import { z } from 'zod';
import { setProjectDefaultWorkerPlace } from '../../projects/project-worker-defaults.ts';
import { projectProcedure } from './procedure.ts';

export const setProjectDefaultWorkerPlaceProcedure = projectProcedure
    .input(projectSetDefaultWorkerPlaceInputSchema)
    .output(z.object({ place: workerPlaceSchema.nullable() }).strict())
    .mutation(
        async ({ ctx, input }) => await setProjectDefaultWorkerPlace(ctx.hausDb, ctx.member, input)
    );
