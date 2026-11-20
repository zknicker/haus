import * as z from 'zod';

export const workerTimestampSchema = z.iso.datetime({ offset: true });
