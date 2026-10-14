import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './modules/auth/auth.routes';
import operationsRoutes from './modules/operations/operations.routes';
import instrumentsRoutes from './modules/instruments/instruments.routes';
import newsRoutes from './modules/news/news.routes';
import { startNewsScheduler } from './modules/news/news.scheduler';
import notificationsRoutes from './modules/notifications/notifications.routes';
import { startNotificationScheduler } from './modules/notifications/scheduler';

const app = express();

const allowedOrigins = new Set([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').forEach((o) => allowedOrigins.add(o.trim()));
}

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sin origen (curl/SSR) o desde orígenes permitidos
    if (!origin || allowedOrigins.has(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/operations', operationsRoutes);
app.use('/api/v1/instruments', instrumentsRoutes);
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startNewsScheduler();
  startNotificationScheduler();
});
