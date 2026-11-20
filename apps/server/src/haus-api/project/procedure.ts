import { TRPCError } from '@trpc/server';
import {
    ChannelNameTakenError,
    ProjectNotFoundError,
    ProjectRefusalError,
} from '../../projects/project-errors.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const projectProcedure = chatProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof ProjectRefusalError || cause instanceof ChannelNameTakenError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof ProjectNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    throw result.error;
});
