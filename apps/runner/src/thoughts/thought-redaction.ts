import { type ModelConnectionCredential, maskCredentialDisclosures } from '@haus/api';
import {
    computerKnownSecrets,
    createJournalRedactor,
} from '@haus/computer/src/execution-journal-upload/journal-redaction.ts';

export function createThoughtRedactor(knownSecrets: Iterable<string>) {
    const redactJournal = createJournalRedactor(knownSecrets);
    return (text: string) => maskCredentialDisclosures(redactJournal(text));
}

export function turnKnownSecrets(
    runCredential: string,
    credential: ModelConnectionCredential,
    environment: Record<string, string | undefined>
) {
    return [...computerKnownSecrets(runCredential, environment), ...credentialValues(credential)];
}

function credentialValues(credential: ModelConnectionCredential) {
    switch (credential.kind) {
        case 'setup-token':
            return [credential.token];
        case 'api-key':
            return [credential.key];
        default:
            return [credential.credential.access, credential.credential.refresh];
    }
}
