export interface ResolveEmailVerifiedAfterEmailUpdateInput {
  currentEmail: string;
  currentEmailVerified: boolean;
  nextEmail: string;
}

/**
 * Preserve verification for profile edits that keep the same address, but clear
 * it as soon as the stored email changes so the new address is not trusted.
 */
export const resolveEmailVerifiedAfterEmailUpdate = ({
  currentEmail,
  currentEmailVerified,
  nextEmail,
}: ResolveEmailVerifiedAfterEmailUpdateInput): boolean =>
  currentEmail.trim() === nextEmail.trim() ? currentEmailVerified : false;
