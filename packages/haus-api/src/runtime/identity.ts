import * as z from 'zod';

export const runtimeUserIdSchema = z.string().regex(/^usr_[A-Za-z0-9_-]+$/);
