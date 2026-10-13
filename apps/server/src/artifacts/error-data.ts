import type { ArtifactErrorData } from '@haus/api';
import { ArtifactError } from './storage.ts';

/** tRPC error data for artifact failures, so the App can branch on the code and conflict head. */
export function artifactErrorData(error: { cause?: unknown }): {
    artifact: ArtifactErrorData | undefined;
} {
    const cause = error.cause;
    return {
        artifact:
            cause instanceof ArtifactError
                ? { code: cause.code, current: cause.current }
                : undefined,
    };
}
