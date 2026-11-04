import * as z from 'zod';

export const cloudAgentTimestampSchema = z.iso.datetime({ offset: true });
