export const hashApiKey = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
