import { expect, test } from 'bun:test';
import { artifactFileKind } from './artifact-file-kind.ts';

const kind = (content_type: string, filename: string) =>
    artifactFileKind({ content_type, filename });

test('MIME type decides the kind when it is specific', () => {
    expect(kind('image/png', 'shot')).toBe('image');
    expect(kind('video/mp4', 'clip.bin')).toBe('video');
    expect(kind('audio/mpeg', 'song')).toBe('audio');
    expect(kind('application/pdf', 'report.docx')).toBe('pdf');
    expect(kind('text/html; charset=utf-8', 'page')).toBe('html');
    expect(kind('text/csv', 'rows')).toBe('spreadsheet');
    expect(
        kind('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck')
    ).toBe('slides');
    expect(
        kind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'memo')
    ).toBe('document');
    expect(kind('application/json', 'data')).toBe('code');
    expect(kind('application/zip', 'bundle')).toBe('archive');
    expect(kind('IMAGE/WEBP', 'x')).toBe('image');
});

test('extension fills in a generic or missing MIME type', () => {
    expect(kind('application/octet-stream', 'photo.HEIC')).toBe('image');
    expect(kind('', 'notes.md')).toBe('document');
    expect(kind('application/octet-stream', 'budget.xlsx')).toBe('spreadsheet');
    expect(kind('application/octet-stream', 'archive.tar.gz')).toBe('archive');
    expect(kind('application/octet-stream', 'index.htm')).toBe('html');
});

test('a specific extension outranks a plain-text MIME type', () => {
    expect(kind('text/plain', 'main.ts')).toBe('code');
    expect(kind('text/plain', 'rows.csv')).toBe('spreadsheet');
    expect(kind('text/plain', 'readme')).toBe('text');
    expect(kind('text/x-weird', 'notes.txt')).toBe('text');
});

test('unknown files fall back to other', () => {
    expect(kind('application/octet-stream', 'blob')).toBe('other');
    expect(kind('application/x-custom', '.env')).toBe('other');
    expect(kind('', 'trailing.')).toBe('other');
});
