import * as React from 'react';

export const WorkerOpenContext = React.createContext<((workerId: string) => void) | null>(null);
