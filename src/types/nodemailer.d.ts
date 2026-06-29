declare module "nodemailer" {
  interface MailAttachment {
    content: Buffer | Uint8Array | string;
    contentType?: string;
    filename: string;
  }

  interface SendMailOptions {
    attachments?: MailAttachment[];
    from: string;
    subject: string;
    text: string;
    to: string[];
  }

  interface TransportOptions {
    auth: {
      pass: string;
      user: string;
    };
    host: string;
    port: number;
    secure: boolean;
  }

  interface Transporter {
    sendMail: (options: SendMailOptions) => Promise<unknown>;
  }

  const nodemailer: {
    createTransport: (options: TransportOptions) => Transporter;
  };

  export default nodemailer;
}
