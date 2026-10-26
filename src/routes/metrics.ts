import { Router, Request, Response } from 'express';
import { registry } from '../metrics/registry';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

export default router;
