import { idSchema, projectSetDefaultMachineInputSchema } from '@haus/api';
import { z } from 'zod';
import { setProjectDefaultMachine } from '../../projects/project-default-machine.ts';
import { projectProcedure } from './procedure.ts';

export const setProjectDefaultMachineProcedure = projectProcedure
    .input(projectSetDefaultMachineInputSchema)
    .output(z.object({ computerId: idSchema.nullable() }).strict())
    .mutation(
        async ({ ctx, input }) => await setProjectDefaultMachine(ctx.hausDb, ctx.member, input)
    );
