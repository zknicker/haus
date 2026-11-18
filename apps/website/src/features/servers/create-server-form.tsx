import { FieldError, Input, Label, TextField } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateServer } from '../../hooks/servers/use-create-server.ts';
import { serverRoute } from './server-routes.ts';
import { slugifyServerName } from './server-slug.ts';

export interface CreateServerFormState {
    displayName: string;
    error: { message: string } | null;
    isPending: boolean;
    isSubmittable: boolean;
    setDisplayName: (displayName: string) => void;
    setSlug: (slug: string) => void;
    slug: string;
    submit: () => void;
}

/** Owns the create-Server fields and mutation so any layout can compose them. */
export function useCreateServerForm(onCreated?: () => void): CreateServerFormState {
    const navigate = useNavigate();
    const createServer = useCreateServer();
    const [displayName, setDisplayName] = React.useState('');
    const [slug, setSlug] = React.useState('');
    const [isSlugEdited, setIsSlugEdited] = React.useState(false);

    return {
        displayName,
        error: createServer.error,
        isPending: createServer.isPending,
        isSubmittable: displayName.trim().length > 0 && slug.trim().length > 0,
        setDisplayName: (nextDisplayName) => {
            setDisplayName(nextDisplayName);
            if (!isSlugEdited) {
                setSlug(slugifyServerName(nextDisplayName));
            }
        },
        setSlug: (nextSlug) => {
            setIsSlugEdited(true);
            setSlug(nextSlug);
        },
        slug,
        submit: () => {
            if (
                createServer.isPending ||
                displayName.trim().length === 0 ||
                slug.trim().length === 0
            ) {
                return;
            }
            createServer.mutate(
                { displayName: displayName.trim(), slug: slug.trim() },
                {
                    onSuccess: (server) => {
                        onCreated?.();
                        navigate(serverRoute(server.slug));
                    },
                }
            );
        },
    };
}

export function CreateServerFields({ form }: { form: CreateServerFormState }) {
    return (
        <>
            <TextField
                fullWidth
                onChange={form.setDisplayName}
                value={form.displayName}
                variant="secondary"
            >
                <Label htmlFor="server-display-name">Name</Label>
                <Input autoComplete="off" id="server-display-name" placeholder="Haus HQ" />
            </TextField>
            <TextField
                fullWidth
                isInvalid={Boolean(form.error)}
                onChange={form.setSlug}
                value={form.slug}
                variant="secondary"
            >
                <Label htmlFor="server-slug">Address</Label>
                <Input autoComplete="off" id="server-slug" placeholder="haus-hq" />
                {form.error ? <FieldError>{form.error.message}</FieldError> : null}
            </TextField>
        </>
    );
}
