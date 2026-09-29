/**
 * Copy and paths shared by the new-user onboarding flow. The admin creates the
 * account with a random password, then the user receives a Better Auth password
 * reset link so they can choose their own password and sign in for the first
 * time.
 */

export const PASSWORD_RESET_PATH = "/reset-password";

export const PASSWORD_RESET_SUBJECT =
  "Set your password for the Order of Service portal";

export interface OnboardingEmailUser {
  firstName?: string;
  name?: string;
}

const greetingName = (user: OnboardingEmailUser): string =>
  user.firstName?.trim() || user.name?.trim() || "there";

export interface PasswordResetEmail {
  subject: string;
  text: string;
}

export const buildPasswordResetEmail = (
  user: OnboardingEmailUser,
  url: string
): PasswordResetEmail => ({
  subject: PASSWORD_RESET_SUBJECT,
  text: [
    `Hi ${greetingName(user)},`,
    "",
    "Use the link below to set your password for the Victory Baptist Church Order of Service portal:",
    "",
    url,
    "",
    "If you are signing in for the first time, this link gets you started with your own password.",
    "The link expires in one hour and can only be used once.",
    "",
    "If you were not expecting this email, you can safely ignore it.",
  ].join("\n"),
});
