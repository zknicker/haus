import { toast } from '@heroui/react';
import { useConnectionAdd } from '../../../hooks/servers/use-connection-add.ts';
import { McpConnectionFormDrawer } from './mcp-server-form.tsx';
import type { McpConnectionSaveInput } from './mcp-server-shared.ts';

export function ConnectionAddDrawer({
    onOpenChange,
    open,
    serverId,
}: {
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}) {
    const add = useConnectionAdd(serverId);

    if (!open) {
        return null;
    }

    const save = async (input: McpConnectionSaveInput) => {
        try {
            await add.mutateAsync({
                ...input,
                headers: input.headers ?? {},
                oauthScopes: input.oauthScopes ?? [],
                serverId,
            });
            onOpenChange(false);
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Try again.';
            toast.danger('Connection failed', { description: message });
        }
    };

    return (
        <McpConnectionFormDrawer
            onOpenChange={onOpenChange}
            onSave={save}
            open
            saving={add.isPending}
        />
    );
}
