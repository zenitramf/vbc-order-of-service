import type { SmtpAuthType } from "~/lib/order-service-types";

/**
 * Test message sent from the Settings page to verify the saved SMTP
 * configuration. Pure builder so the content stays covered by unit tests.
 */
export const buildTestEmailMessage = (
  sentAt: string,
  authType: SmtpAuthType
) => {
  const authLabel = authType === "oauth2" ? "OAuth 2.0" : "password";

  return {
    subject: "Test email from Order of Service",
    text: [
      `This is a test email sent from the Settings page at ${sentAt}.`,
      `SMTP authentication mode: ${authLabel}.`,
      "If you received this, the saved email configuration works.",
    ].join("\n"),
  };
};
