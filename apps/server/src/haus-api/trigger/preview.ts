import {
    githubTriggerPreviewInputSchema,
    githubTriggerPreviewResultSchema,
    idSchema,
} from '@haus/api';
import * as z from 'zod';
import { previewGithubTrigger } from '../../triggers/github-trigger-preview.ts';
import { requireTriggerOperator } from '../../triggers/operator-triggers.ts';
import { readTrigger } from '../../triggers/trigger-queries.ts';
import { triggerProcedure } from './procedure.ts';

export const previewTriggerProcedure = triggerProcedure
    .input(
        githubTriggerPreviewInputSchema.extend({ serverId: z.string().min(1), triggerId: idSchema })
    )
    .output(githubTriggerPreviewResultSchema)
    .query(async ({ ctx, input }) => {
        await requireTriggerOperator(ctx.hausDb, ctx.member, input.serverId);
        const trigger = await readTrigger(ctx.hausDb, { ...input, origin: ctx.requestOrigin });
        return await previewGithubTrigger(ctx.hausDb, input.serverId, trigger, input);
    });
