import type { SQL } from 'bun';

export type DatasetRow = Record<string, DatasetValue>;
export type DatasetValue = string | number | boolean | null | Date | readonly string[];
export type DatasetTables = Map<string, DatasetRow[]>;

const insertChunk = 400;

export async function insertDatasetTables(database: SQL, tables: DatasetTables) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        for (const [table, rows] of tables) {
            for (let start = 0; start < rows.length; start += insertChunk) {
                await tx.unsafe(insertStatement(table, rows.slice(start, start + insertChunk)));
            }
        }
    });
}

export function addRows(tables: DatasetTables, table: string, ...rows: DatasetRow[]) {
    const existing = tables.get(table);
    if (existing) {
        existing.push(...rows);
        return;
    }
    tables.set(table, [...rows]);
}

export function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d_2b_79_f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

export function idBody(value: number) {
    return value.toString(36).padStart(16, '0');
}

function insertStatement(table: string, rows: DatasetRow[]) {
    const first = rows[0];
    if (!first) {
        throw new Error(`No rows for ${table}`);
    }
    const columns = Object.keys(first);
    const values = rows.map((row) => {
        const keys = Object.keys(row);
        if (keys.length !== columns.length || keys.some((key, index) => key !== columns[index])) {
            throw new Error(`Rows for ${table} disagree on columns`);
        }
        return `(${columns.map((column) => literal(row[column] ?? null)).join(', ')})`;
    });
    return `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${values.join(', ')}`;
}

function literal(value: DatasetValue): string {
    if (value === null) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'::timestamptz`;
    }
    if (typeof value === 'string') {
        return quote(value);
    }
    return value.length === 0
        ? `'{}'::text[]`
        : `ARRAY[${value.map((item) => quote(item)).join(', ')}]::text[]`;
}

function quote(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}
