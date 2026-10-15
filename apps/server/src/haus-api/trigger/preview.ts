import {
    githubTriggerPreviewInputSchema,
    githubTriggerPreviewResultSchema,
    idSchema,
    linearTriggerPreviewInputSchema,
    linearTriggerPreviewResultSchema,
} from '@haus/api';
import * as z from 'zod';
import { previewGithubTrigger } from '../../triggers/github-trigger-preview.ts';
import { linearAuthoring } from '../../triggers/linear-trigger-config.ts';
import { previewLinearTrigger } from '../../triggers/linear-trigger-preview.ts';
import { requireTriggerOperator } from '../../triggers/operator-triggers.ts';
import { readTrigger } from '../../triggers/trigger-queries.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

const address = { serverId: z.string().min(1), triggerId: idSchema };

/**
 * Selection preview over a caller-supplied webhook body: a GitHub body with
 * its event name, or a raw Linear body. Nothing is recorded or woken.
 */
export const previewTriggerProcedure = triggerProcedure
    .input(
        z.union([
            githubTriggerPreviewInputSchema.extend(address),
            linearTriggerPreviewInputSchema.extend(address),
        ])
    )
    .output(z.union([githubTriggerPreviewResultSchema, linearTriggerPreviewResultSchema]))
    .query(async ({ ctx, input }) => {
        await requireTriggerOperator(ctx.hausDb, ctx.member, input.serverId);
        const trigger = await readTrigger(ctx.hausDb, { ...input, origin: ctx.requestOrigin });
        if ('event' in input) {
            return await previewGithubTrigger(ctx.hausDb, input.serverId, trigger, input);
        }
        return await previewLinearTrigger(linearAuthoring(ctx.hausDb, ctx.linear), {
            now: triggerClock.now(),
            payload: input.payload,
            serverId: input.serverId,
            trigger,
        });
    });
