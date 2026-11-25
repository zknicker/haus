import type { ComputerUseReadiness } from '@haus/api';
import { Alert, Button } from '@heroui/react';
import { type ComputerUsePermission, missingComputerUsePermission } from './computer-use-model.ts';

export function ComputerUseWarning({
    onFix,
    readiness,
}: {
    onFix: (id: ComputerUsePermission['id']) => void;
    readiness: ComputerUseReadiness | undefined;
}) {
    const missing = missingComputerUsePermission(readiness);
    if (!missing) {
        return null;
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Computer use can’t work on this Mac.</Alert.Title>
                <Alert.Description>macOS hasn’t given Haus Computer access.</Alert.Description>
            </Alert.Content>
            <Button onPress={() => onFix(missing.id)} size="sm" variant="ghost">
                Fix
            </Button>
        </Alert>
    );
}
