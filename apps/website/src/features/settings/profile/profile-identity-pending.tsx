import { Input, Separator, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { timezoneInfo } from './timezone-row.tsx';

/** The Handle row's explanation, shared by the live and pending rows. */
export const handleInfo = 'Your unique @name on this Server.';

/** Reserve the identity rows without inventing an editable member. */
export function ProfileIdentityPending({ error }: { error?: string }) {
    return (
        <ItemCardGroup aria-busy={!error} className="overflow-hidden">
            {error ? (
                <p className="text-danger text-sm" role="alert">
                    {error}
                </p>
            ) : null}
            {[
                { title: 'Photo' },
                { title: 'Display Name' },
                { info: handleInfo, title: 'Handle' },
                { info: timezoneInfo, title: 'Timezone' },
            ].map((row, index) => (
                <Fragment key={row.title}>
                    {index > 0 ? <Separator /> : null}
                    <ItemCard>
                        <ItemCard.Content>
                            {row.info ? (
                                <SettingsRowTitle info={row.info}>{row.title}</SettingsRowTitle>
                            ) : (
                                <ItemCard.Title>{row.title}</ItemCard.Title>
                            )}
                        </ItemCard.Content>
                        <ItemCard.Action>
                            {row.title === 'Photo' ? (
                                <div aria-hidden="true" className="size-10" />
                            ) : (
                                <TextField
                                    aria-label={
                                        row.title === 'Display Name' ? 'Display name' : row.title
                                    }
                                    className="w-56 max-w-full"
                                    isDisabled
                                    value=""
                                    variant="secondary"
                                >
                                    <Input />
                                </TextField>
                            )}
                        </ItemCard.Action>
                    </ItemCard>
                </Fragment>
            ))}
        </ItemCardGroup>
    );
}
