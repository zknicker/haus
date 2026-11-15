import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarPicker } from './avatar-picker.tsx';

const noop = async () => undefined;

test('idle picker shows the upload action and accepts the shared media types', () => {
    const markup = renderToStaticMarkup(
        <AvatarPicker label="profile photo" name="Zach" onSelect={noop} src={null} />
    );

    expect(markup).toContain('aria-label="Upload profile photo"');
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).toContain('ZA');
    expect(markup).not.toContain('aria-label="Loading"');
    expect(markup).not.toContain('disabled=""');
});

test('pending upload disables the control and shows a loading spinner', () => {
    const markup = renderToStaticMarkup(
        <AvatarPicker
            isPending
            label="profile photo"
            name="Zach"
            onSelect={noop}
            src="/api/avatars/avt_0123456789abcdef"
        />
    );

    expect(markup).toContain('aria-label="Change profile photo"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain('role="status"');
});

test('generate menu trigger stays a menu button for ordinary Agents', () => {
    const markup = renderToStaticMarkup(
        <AvatarPicker
            generateUnavailableReason="Not configured on this Server."
            label="Agent photo"
            name="Scout"
            onGenerate={noop}
            onSelect={noop}
            src={null}
        />
    );

    expect(markup).toContain('aria-label="Upload Agent photo"');
    expect(markup).toContain('aria-haspopup="true"');
    expect(markup).toContain('SC');
});
