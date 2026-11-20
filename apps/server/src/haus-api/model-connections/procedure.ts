import { TRPCError } from '@trpc/server';
import {
    ModelConnectionLabelTakenError,
    ModelConnectionMismatchError,
    ModelConnectionNotFoundError,
    ModelConnectionsDeniedError,
    ModelSignInNotFoundError,
    RunnerNotConnectedError,
} from '../../model-connections/model-connection-errors.ts';
import { SecretsKeyMissingError } from '../../secrets/sealed-secret.ts';
import { memberProcedure } from '../server/procedure.ts';

const refusalCodes = [
    [ModelConnectionsDeniedError, 'FORBIDDEN'],
    [ModelConnectionNotFoundError, 'NOT_FOUND'],
    [ModelSignInNotFoundError, 'NOT_FOUND'],
    [ModelConnectionLabelTakenError, 'CONFLICT'],
    [ModelConnectionMismatchError, 'BAD_REQUEST'],
    [RunnerNotConnectedError, 'SERVICE_UNAVAILABLE'],
    [SecretsKeyMissingError, 'SERVICE_UNAVAILABLE'],
] as const;

export const modelConnectionProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    const refusal = refusalCodes.find(([type]) => cause instanceof type);
    if (refusal && cause instanceof Error) {
        throw new TRPCError({ cause, code: refusal[1], message: cause.message });
    }
    return result;
});
