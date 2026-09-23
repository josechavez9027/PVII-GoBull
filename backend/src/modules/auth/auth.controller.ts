import { Request, Response } from 'express';
import { AuthService, registerSchema, loginSchema } from '../../services/auth.service';
import { z } from 'zod';

import { MailService } from '../../services/mail.service';

const authService = new AuthService();
const mailService = new MailService();

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const data = registerSchema.parse(req.body);
      const token = await authService.register(data);
      
      res.cookie('token', token, { httpOnly: true });
      res.status(201).json({ token });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const token = await authService.login(data);
      
      res.cookie('token', token, { httpOnly: true });
      res.json({ token });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  async logout(req: Request, res: Response) {
    res.clearCookie('token');
    res.json({ message: 'Sesión cerrada exitosamente' });
  }

  async me(req: Request, res: Response) {
    res.json({ user: req.user });
  }
  
  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = z
        .object({
          email: z.string().email('Ingresa un correo electrónico válido'),
        })
        .parse(req.body);

      try {
        const token = await authService.createPasswordResetToken(email);
        // Send actual email asynchronously (don't await so we respond fast)
        mailService.sendPasswordResetEmail(email, token).catch((err) => {
          console.error('Fallo al enviar correo en segundo plano:', err);
        });
        console.log(`[AUTH] Token de recuperación generado para ${email}`);
        return res.json({
          success: true,
          message: 'El mensaje ha sido enviado, revisa tu correo para continuar el proceso.',
        });
      } catch (err: any) {
        if (err.message === 'Usuario no encontrado') {
          return res.status(404).json({
            success: false,
            notFound: true,
            message: 'No se ha encontrado el correo en la lista de usuarios.',
          });
        }
        throw err;
      }
    } catch (error: any) {
      if (error && error.errors && error.errors.length > 0) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      return res.status(400).json({ message: error.message || 'Error al procesar la solicitud' });
    }
  }
  
  async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = z.object({
        token: z.string(),
        newPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres')
      }).parse(req.body);
      
      await authService.resetPassword(token, newPassword);
      res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error: any) {
      console.error('[RESET_PASSWORD ERROR]:', error);
      if (error && error.errors) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(400).json({ message: error.message });
    }
  }
}
