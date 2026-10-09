import { z } from 'zod';
import raw from '../../../content/themes/magical-kingdom/ui.json';
// The file is the finite contract; every value must be short, nonempty authored copy.
const keys = Object.keys(raw) as (keyof typeof raw)[];
const schema = z.object(Object.fromEntries(keys.map((k) => [k, z.string().min(1).max(160)]))).strict();
schema.parse(raw);
export const WORDS = raw;
export const line = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
