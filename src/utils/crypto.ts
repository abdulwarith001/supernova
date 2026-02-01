import crypto from "crypto";
import os from "os";

// Derive a simple key from hardware info (mac address/machine id equiv).
// Note: In a real production app, we'd use system keychain (keytar),
// but for this scope, a consistent machine-specific salt is sufficient obfuscation.
const ALGORITHM = "aes-256-cbc";
// Derive a stable key from the user's local profile.
// Hostname is avoided as it can change (e.g. .local suffix) which breaks decryption.
const ENCRYPTION_KEY = crypto.scryptSync(
  os.userInfo().username + os.homedir(),
  "supernova-stable-salt",
  32,
);
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
