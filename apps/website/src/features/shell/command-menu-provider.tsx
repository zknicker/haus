import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { isCommandMenuKey } from './command-menu-key.ts';

interface CommandMenuValue {
    close: () => void;
    isOpen: boolean;
    open: () => void;
    query: string;
    setOpen: (isOpen: boolean) => void;
    setQuery: (query: string) => void;
}

const CommandMenuContext = createContext<CommandMenuValue | null>(null);

/**
 * Whether the palette is open and what has been typed into it are one
 * interaction shared across sibling shell regions: the sidebar trigger opens
 * it, the dialog input drives the query, and each result group reads that query
 * to fetch its own matches. The shortcut lives here too, because Cmd+K belongs
 * to the palette rather than to whichever region happens to render it.
 */
export function CommandMenuProvider({ children }: PropsWithChildren) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');

    // Opening clears the previous query so the palette never reopens mid-search;
    // closing leaves it alone, which keeps the exit animation from flickering
    // through an empty result list.
    const open = useCallback(() => {
        setQuery('');
        setIsOpen(true);
    }, []);
    const close = useCallback(() => setIsOpen(false), []);
    const setOpen = useCallback(
        (nextOpen: boolean) => {
            if (nextOpen) {
                open();
                return;
            }
            close();
        },
        [close, open]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isCommandMenuKey(event)) {
                event.preventDefault();
                setOpen(!isOpen);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, setOpen]);

    const value = useMemo<CommandMenuValue>(
        () => ({ close, isOpen, open, query, setOpen, setQuery }),
        [close, isOpen, open, query, setOpen]
    );

    return <CommandMenuContext.Provider value={value}>{children}</CommandMenuContext.Provider>;
}

export function useCommandMenu() {
    const value = useContext(CommandMenuContext);

    if (!value) {
        throw new Error('useCommandMenu must be used inside CommandMenuProvider.');
    }

    return value;
}
