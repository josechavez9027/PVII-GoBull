import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { notificationsController } from "./notifications.controller";

const router = Router();

// Todas las rutas requieren usuario autenticado
router.use(authenticate);

// 1. Contador del header (debe ir antes de :id)
router.get("/unread-count", notificationsController.unreadCount);

// 2. Operaciones masivas / dispatch
router.post("/read-all", notificationsController.markAllRead);
router.post("/dispatch", notificationsController.dispatch);

// 3. Preferencias de usuario
router.get("/settings", notificationsController.getSettings);
router.put("/settings", notificationsController.updateSettings);

// 4. Suscripciones Web Push
router.post("/push-subscription", notificationsController.subscribePush);
router.delete("/push-subscription", notificationsController.revokePush);

// 5. Bandeja de notificaciones
router.get("/", notificationsController.list);

// 6. Marcar una individual como leída (al final para no colisionar con rutas fijas)
router.post("/:id/read", notificationsController.markRead);

export default router;
