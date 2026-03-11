import nodemailer from 'nodemailer';
import * as XLSX from 'xlsx';

export class EmailService {
  private static createTransporter() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  private static createExcelBuffer(logs: any[]) {
    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  public static async sendBackupEmail(to: string, logs: any[]) {
    if (!to) {
      console.warn('[EmailService] Recipient email not configured. Skipping backup.');
      return;
    }

    if (!logs || logs.length === 0) {
      console.log('[EmailService] No logs to backup.');
      return;
    }

    try {
      const transporter = this.createTransporter();
      const excelBuffer = this.createExcelBuffer(logs);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `request_logs_backup_${dateStr}.xlsx`;

      const mailOptions = {
        from: `"AI Research Engine" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: `[Backup] Request Logs - ${dateStr}`,
        text: `Attached is a backup of ${logs.length} request logs.`,
        attachments: [
          {
            filename: filename,
            content: excelBuffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        ]
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('[EmailService] Backup email sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending backup email:', (error as Error).message);
    }
  }
}
