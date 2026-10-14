import cron from "node-cron";
import { notificationsService } from "./notifications.service";

let notificationCronTask: any = null;

export function startNotificationScheduler(cronExpr = "*/15 * * * *"): void {
  if (notificationCronTask) {
    return;
  }

  notificationCronTask = cron.schedule(cronExpr, async () => {
    try {
      const result = await notificationsService.evaluateAndDispatch();
      if (result.notificationsCreated > 0 || result.pushSent > 0) {
        console.log("[notifications.scheduler] Dispatch executed:", result);
      }
    } catch (err: any) {
      console.error(
        "[notifications.scheduler] Error in scheduled dispatch:",
        err?.message || err,
      );
    }
  });

  console.log(
    `[notifications.scheduler] Scheduler started with cron: ${cronExpr}`,
  );
}

export function stopNotificationScheduler(): void {
  if (notificationCronTask) {
    notificationCronTask.stop();
    notificationCronTask = null;
  }
}
