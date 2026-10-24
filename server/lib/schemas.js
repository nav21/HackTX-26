// zod schemas for request bodies/queries/params (API.md). Exported for routes and tests.
import { z } from 'zod';
import { isValidZone } from './time.js';

export const MODES = ['care', 'habit', 'security'];
export const CONTAINER_TYPES = ['pillbox', 'supplement', 'backpack', 'drawer', 'other'];
export const TONES = ['supportive', 'roast'];

const uuid = z.uuid();
const timezone = z.string().refine(isValidZone, 'Must be an IANA timezone like "America/Chicago"');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be "HH:MM" (24 h)');
const intFromQuery = (min, max, def) => z.coerce.number().int().min(min).max(max).default(def);
const boolFromQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

export const idParams = z.object({ id: uuid });
export const memberParams = z.object({ id: uuid, userId: uuid });

export const patchMe = z.object({
  display_name: z.string().trim().min(1).max(50).optional(),
  timezone: timezone.optional(),
});

export const claimDevice = z.object({
  pairing_code: z.string().trim().regex(/^\d{4}$/, 'Must be 4 digits'),
  name: z.string().trim().min(1).max(40),
  mode: z.enum(MODES),
  container_type: z.enum(CONTAINER_TYPES),
});

export const patchDevice = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  mode: z.enum(MODES).optional(),
  armed: z.boolean().optional(),
  silent: z.boolean().optional(),
  tone: z.enum(TONES).optional(),
  group_id: uuid.nullable().optional(),
  container_type: z.enum(CONTAINER_TYPES).optional(),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
  timezone: timezone.optional(),
});

export const addMember = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['caregiver', 'viewer']),
});

export const eventsQuery = z.object({
  limit: intFromQuery(1, 200, 50),
  before: z.coerce.number().int().positive().optional(),
});

export const simulateBody = z.object({ type: z.enum(['OPEN', 'CLOSE', 'HB']) });

export const notificationsQuery = z.object({
  unread: boolFromQuery,
  limit: intFromQuery(1, 200, 50),
});

export const scheduleBody = z.object({
  label: z.string().trim().min(1).max(60),
  time_of_day: hhmm,
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((d) => [...new Set(d)].sort()),
  window_before_min: z.number().int().min(0).max(720).optional(),
  grace_min: z.number().int().min(0).max(720).optional(),
  escalate_after_min: z.number().int().min(0).max(720).optional(),
});

export const deviceEventsBody = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(['OPEN', 'CLOSE', 'HB', 'BOOT']),
        seq: z.number().int().min(0).optional(),
        ldr: z.number().int().min(0).max(65535).optional(),
        fw_version: z.string().trim().max(40).optional(),
        at: z.iso.datetime({ offset: true }).optional(),
      })
      .refine((e) => !['OPEN', 'CLOSE'].includes(e.type) || e.seq !== undefined, {
        message: 'seq is required for OPEN/CLOSE',
        path: ['seq'],
      })
    )
    .min(1)
    .max(100),
});
