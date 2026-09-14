import { prisma } from './prisma.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class AuthService {
  async register(data: z.infer<typeof registerSchema>) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new Error('El usuario ya existe');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
    });

    return this.generateToken(user.id);
  }

  async login(data: z.infer<typeof loginSchema>) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new Error('Credenciales incorrectas');
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
      throw new Error('Credenciales incorrectas');
    }

    return this.generateToken(user.id);
  }
  
  async createPasswordResetToken(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    
    // Simple random string token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
      }
    });
    
    return token;
  }
  
  async resetPassword(token: string, newPassword: string) {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token }
    });
    
    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new Error('Token inválido o expirado');
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword }
    });
    
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id }
    });
  }

  private generateToken(userId: string) {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'super-secret-jwt-key', {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });
  }
}
