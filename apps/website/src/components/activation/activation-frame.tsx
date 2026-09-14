import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';
import { HausGhost } from '../haus-ghost.tsx';
import { AppShell, AppShellDragRegion } from '../ui/app-shell.tsx';
import './activation.css';

interface ActivationSlots {
    content: HTMLDivElement | null;
    end: HTMLDivElement | null;
    progress: HTMLDivElement | null;
}

const ActivationSlotsContext = createContext<ActivationSlots | null>(null);

/** Owns the frame and animated mark for the entire renderer lifetime. */
export function ActivationFrame({ children }: PropsWithChildren) {
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    const [end, setEnd] = useState<HTMLDivElement | null>(null);
    const [progress, setProgress] = useState<HTMLDivElement | null>(null);
    const slots = useMemo(() => ({ content, end, progress }), [content, end, progress]);

    return (
        <ActivationSlotsContext value={slots}>
            <AppShell className="activation-frame app-window-shell">
                <AppShellDragRegion />
                <header className="activation-topbar">
                    <div className="activation-topbar__progress" ref={setProgress} />
                    <div ref={setEnd} />
                </header>
                <main className="activation-main">
                    <div className="activation-column">
                        <div className="activation-brand">
                            <HausGhost
                                animated
                                aria-hidden="true"
                                className="activation-mark"
                                fill="iridescent"
                                size={56}
                            />
                        </div>
                        <div className="activation-content" ref={setContent} />
                    </div>
                </main>
            </AppShell>
            {children}
        </ActivationSlotsContext>
    );
}

export function useActivationSlots() {
    const slots = useContext(ActivationSlotsContext);
    if (!slots) {
        throw new Error('Activation screens require the persistent ActivationFrame.');
    }
    return slots;
}
