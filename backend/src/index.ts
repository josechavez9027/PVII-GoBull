import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './modules/auth/auth.routes';
import operationsRoutes from './modules/operations/operations.routes';
import instrumentsRoutes from './modules/instruments/instruments.routes';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
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
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
