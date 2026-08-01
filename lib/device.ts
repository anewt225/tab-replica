import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Device identity without accounts.
 *
 * Every browser gets a random id in a signed httpOnly cookie. It is not a login
 * — it carries no privileges — it just lets a phone remember which participant
 * it is after a refresh, and lets /my-bills list the bills this device touched.
 * The signature stops someone hand-editing the cookie to impersonate another
 * participant's claims.
 */

const COOKIE_NAME = "tab_device";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // a year

function secret(): string {
  const value = process.env.DEVICE_COOKIE_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DEVICE_COOKIE_SECRET is not set. Generate one with `openssl rand -hex 32`.",
      );
    }
    // Dev convenience only; never reached in production.
    return "insecure-development-secret";
  }
  return value;
}

function sign(deviceId: string): string {
  return createHmac("sha256", secret()).update(deviceId).digest("base64url");
}

function verify(deviceId: string, signature: string): boolean {
  const expected = Buffer.from(sign(deviceId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parse(raw: string | undefined): string | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;
  const deviceId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  return verify(deviceId, signature) ? deviceId : null;
}

/** Read the current device id, or null if this browser has never been here. */
export async function readDeviceId(): Promise<string | null> {
  const store = await cookies();
  return parse(store.get(COOKIE_NAME)?.value);
}

/**
 * Read the device id, minting and setting one if absent.
 * Only callable from a Route Handler or Server Action — Server Components
 * cannot set cookies.
 */
export async function ensureDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = parse(store.get(COOKIE_NAME)?.value);
  if (existing) return existing;

  const deviceId = randomUUID();
  store.set(COOKIE_NAME, `${deviceId}.${sign(deviceId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return deviceId;
}
