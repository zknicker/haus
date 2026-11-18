import {
    agentRuntimeBrowserSettingsSchema,
    agentRuntimeSaveBrowserSettingsSchema,
} from '@haus/api';
import { z } from 'zod';
import { computerIdSchema } from '../../computers/contracts.ts';
import { serverIdSchema } from '../../servers/contracts.ts';

const browserTargetSchema = z
    .object({
        computerId: computerIdSchema,
        serverId: serverIdSchema,
    })
    .strict();

export const browserGetInputSchema = browserTargetSchema;
export const browserSaveInputSchema = browserTargetSchema
    .extend({ settings: agentRuntimeSaveBrowserSettingsSchema })
    .strict();
export const browserSettingsOutputSchema = agentRuntimeBrowserSettingsSchema;
