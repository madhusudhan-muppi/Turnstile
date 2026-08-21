import QRCode from "qrcode";
import { randomBytes } from "node:crypto";

/** Opaque, unguessable one-time-use secret tied to a single registration. */
export function generateQrToken(): string {
  return randomBytes(24).toString("hex");
}

const PREFIX = "TURNSTILE";

export function encodeQrPayload(registrationId: string, qrToken: string): string {
  return `${PREFIX}:${registrationId}:${qrToken}`;
}

export function decodeQrPayload(payload: string): { registrationId: string; qrToken: string } | null {
  const parts = payload.trim().split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  return { registrationId: parts[1], qrToken: parts[2] };
}

export async function qrToDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, width: 320 });
}
