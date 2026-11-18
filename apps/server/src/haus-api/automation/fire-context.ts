import { automationFireContextInputSchema, automationFireContextSchema } from '@haus/api';
import { readAutomationFireContext } from '../../automations/fire-context.ts';
import { automationProcedure } from './procedure.ts';

export const automationFireContextProcedure = automationProcedure
    .input(automationFireContextInputSchema)
    .output(automationFireContextSchema)
    .query(
        async ({ ctx, input }) => await readAutomationFireContext(ctx.hausDb, ctx.member, input)
    );
