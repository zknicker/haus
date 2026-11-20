import { type ModelConnectionCredential, modelConnectionCredentialSchema } from '@haus/api';
import { openSecret, type SecretsKey, sealSecret } from '../secrets/sealed-secret.ts';

export function sealCredential(key: SecretsKey | null, credential: ModelConnectionCredential) {
    return sealSecret(key, JSON.stringify(credential));
}

export function openCredential(key: SecretsKey | null, sealed: unknown) {
    return modelConnectionCredentialSchema.parse(JSON.parse(openSecret(key, sealed)));
}
