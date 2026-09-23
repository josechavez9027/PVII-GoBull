import { Router } from 'express';
import { OperationsController } from './operations.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const operationsController = new OperationsController();

router.use(authenticate);

router.get('/', operationsController.list);
router.get('/positions', operationsController.positions);
router.get('/summary', operationsController.summary);
router.post('/', operationsController.create);
router.delete('/:id', operationsController.remove);

export default router;