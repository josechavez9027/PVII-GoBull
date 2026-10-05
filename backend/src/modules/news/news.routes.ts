import { Router } from 'express';
import { NewsController } from './news.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const newsController = new NewsController();

router.use(authenticate);

// ── Rutas fijas (deben declararse antes de /:id) ───────────────
router.get('/sync-status', newsController.syncStatus);
router.post('/sync/portfolio', newsController.syncPortfolio);
router.get('/categories', newsController.categories);
router.get('/relevant', newsController.relevant);
router.get('/favorites', newsController.favorites);
router.get('/', newsController.list);

// ── Rutas parametrizadas por ID de noticia ─────────────────────
router.get('/:id', newsController.detail);
router.post('/:id/view', newsController.view);
router.post('/:id/favorite', newsController.addFavorite);
router.delete('/:id/favorite', newsController.removeFavorite);

export default router;
