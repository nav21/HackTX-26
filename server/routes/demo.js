// Demo helpers (SPEC §12). Mounted only when DEMO_MODE=true.
import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { deviceIdParams } from '../lib/schemas.js';
import { requireUser, loadDevice } from '../middleware/auth.js';
import { toDoseDTO, toScheduleDTO } from '../services/devices.js';
import { scheduleNow } from '../engine/care.js';
import { withDeviceLock } from '../engine/index.js';

const router = Router();
router.use(requireUser);

// Next active dose → ~1 min from now, 1-min grace + escalation (see engine/care.js scheduleNow).
router.post(
  '/schedule-now/:deviceId',
  validate({ params: deviceIdParams }),
  loadDevice('owner', 'deviceId'),
  async (req, res) => {
    if (req.device.mode !== 'care') throw new HttpError(400, 'Switch the device to Care mode first');
    const result = await withDeviceLock(req.device.id, () => scheduleNow(req.device));
    if (!result) throw new HttpError(400, 'Add a schedule first');
    res.json({ schedule: toScheduleDTO(result.schedule), dose: toDoseDTO(result.dose, result.schedule) });
  }
);

export default router;
