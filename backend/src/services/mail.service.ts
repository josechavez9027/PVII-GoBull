import * as nodemailer from 'nodemailer';

export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const frontendUrl = process.env.PASSWORD_RESET_URL || 'http://localhost:4200/reset-password';
    const resetLink = `${frontendUrl}?token=${token}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || '"GoBull Support" <no-reply@gobull.com>',
      to,
      subject: 'Recuperación de contraseña - GoBull',
      text: `Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para crear una nueva: ${resetLink}\n\nSi no fuiste tú, puedes ignorar este correo.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Recuperación de contraseña</h2>
          <p>Has solicitado restablecer tu contraseña para tu cuenta en GoBull.</p>
          <p>Haz clic en el botón de abajo para crear una nueva contraseña:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Restablecer mi contraseña</a>
          </div>
          <p>O copia y pega este enlace en tu navegador:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Si no solicitaste este cambio, puedes ignorar este correo y tu contraseña seguirá siendo la misma.</p>
        </div>
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`[MAIL] Correo enviado a ${to}: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('[MAIL] Error enviando correo:', error);
      throw error;
    }
  }
}
