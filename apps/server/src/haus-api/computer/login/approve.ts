import { TRPCError } from '@trpc/server';
import { approveComputerLoginSchema } from '../../../computers/contracts.ts';
import { ComputerLoginError } from '../../../computers/login-errors.ts';
import { approveComputerLogin } from '../../../computers/login-service.ts';
import { humanProcedure } from '../../trpc.ts';

export const approveComputerLoginProcedure = humanProcedure
    .input(approveComputerLoginSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            return await approveComputerLogin(ctx.hausDb, ctx.userId!, input);
        } catch (cause) {
            throwComputerLoginTrpcError(cause);
        }
    });

export function throwComputerLoginTrpcError(cause: unknown): never {
    if (!(cause instanceof ComputerLoginError)) {
        throw cause;
    }
    throw new TRPCError({
        cause,
        code: computerLoginTrpcCode(cause.code),
        message: cause.message,
    });
}

function computerLoginTrpcCode(code: ComputerLoginError['code']) {
    if (code === 'computer_login_not_found') {
        return 'NOT_FOUND' as const;
    }
    if (code === 'computer_login_denied') {
        return 'FORBIDDEN' as const;
    }
    if (code === 'computer_login_consumed' || code === 'computer_login_already_approved') {
        return 'CONFLICT' as const;
    }
    return 'BAD_REQUEST' as const;
}
