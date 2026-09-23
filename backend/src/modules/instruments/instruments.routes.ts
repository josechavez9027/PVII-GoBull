import { Router } from 'express';
import { InstrumentsController } from './instruments.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const instrumentsController = new InstrumentsController();

router.use(authenticate);

router.get('/', instrumentsController.suggest);

export default router;
