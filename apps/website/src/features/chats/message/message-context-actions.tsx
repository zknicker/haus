import * as React from 'react';

const MessageContextActions = React.createContext<null | { onViewTurnDetails: () => void }>(null);

export function MessageContextActionsProvider({
    children,
    onViewTurnDetails,
}: {
    children: React.ReactNode;
    onViewTurnDetails: () => void;
}) {
    const value = React.useMemo(() => ({ onViewTurnDetails }), [onViewTurnDetails]);
    return <MessageContextActions value={value}>{children}</MessageContextActions>;
}

export function useMessageContextActions() {
    return React.use(MessageContextActions);
}
