import { Alert } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';

export function ClaimState({
    description,
    title,
    tone = 'muted',
}: {
    description: string;
    title: string;
    tone?: 'error' | 'muted';
}) {
    if (tone === 'error') {
        return (
            <div className="flex flex-1 items-center justify-center p-6">
                <Alert role="alert" status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>{title}</Alert.Title>
                        <Alert.Description>{description}</Alert.Description>
                    </Alert.Content>
                </Alert>
            </div>
        );
    }

    return (
        <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    <EmptyState.Description>{description}</EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
