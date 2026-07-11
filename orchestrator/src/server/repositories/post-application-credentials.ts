import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serviceUnavailable } from "@infra/errors";

export type PostApplicationCredentials = Record<string, unknown>;

export type PostApplicationCredentialEnvelope = {
  version: 1;
  keyId: "primary";
  iv: string;
  tag: string;
  ciphertext: string;
  metadata: PostApplicationCredentialMetadata;
};

export type PostApplicationCredentialMetadata = {
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  scope: string | null;
  tokenType: string | null;
  expiryDate: number | null;
  email: string | null;
};

type CredentialKeys = {
  primaryKey?: string;
  previousKey?: string;
};

const CREDENTIAL_ENVELOPE_MARKERS = [
  "version",
  "keyId",
  "iv",
  "tag",
  "ciphertext",
  "metadata",
] as const;

export const POST_APPLICATION_CREDENTIALS_UNAVAILABLE_MESSAGE =
  "Post-application credentials are unavailable because POST_APPLICATION_CREDENTIALS_KEY is not configured with a valid 32-byte base64 key.";

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseKey(value: string | undefined, envName: string): Buffer {
  if (!value) {
    throw serviceUnavailable(
      envName === "POST_APPLICATION_CREDENTIALS_KEY"
        ? POST_APPLICATION_CREDENTIALS_UNAVAILABLE_MESSAGE
        : `Post-application credentials are unavailable because ${envName} is invalid.`,
    );
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw serviceUnavailable(
      envName === "POST_APPLICATION_CREDENTIALS_KEY"
        ? POST_APPLICATION_CREDENTIALS_UNAVAILABLE_MESSAGE
        : `Post-application credentials are unavailable because ${envName} is invalid.`,
    );
  }
  return key;
}

function resolvePrimaryKey(keys: CredentialKeys): Buffer {
  return parseKey(
    keys.primaryKey ?? process.env.POST_APPLICATION_CREDENTIALS_KEY,
    "POST_APPLICATION_CREDENTIALS_KEY",
  );
}

function resolvePreviousKey(keys: CredentialKeys): Buffer | null {
  const value =
    keys.previousKey ?? process.env.POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS;
  return value
    ? parseKey(value, "POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS")
    : null;
}

export function summarizePostApplicationCredentials(
  credentials: PostApplicationCredentials,
): PostApplicationCredentialMetadata {
  return {
    hasRefreshToken: Boolean(asNonEmptyString(credentials.refreshToken)),
    hasAccessToken: Boolean(asNonEmptyString(credentials.accessToken)),
    scope: asNonEmptyString(credentials.scope),
    tokenType: asNonEmptyString(credentials.tokenType),
    expiryDate: asFiniteNumber(credentials.expiryDate),
    email: asNonEmptyString(credentials.email),
  };
}

export function isPostApplicationCredentialEnvelope(
  value: unknown,
): value is PostApplicationCredentialEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<PostApplicationCredentialEnvelope>;
  return (
    envelope.version === 1 &&
    envelope.keyId === "primary" &&
    typeof envelope.iv === "string" &&
    typeof envelope.tag === "string" &&
    typeof envelope.ciphertext === "string" &&
    !!envelope.metadata &&
    typeof envelope.metadata === "object"
  );
}

export function isLegacyPostApplicationCredentials(
  value: unknown,
): value is PostApplicationCredentials {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !CREDENTIAL_ENVELOPE_MARKERS.some((marker) => marker in value)
  );
}

function envelopeAad(
  envelope: Pick<
    PostApplicationCredentialEnvelope,
    "version" | "keyId" | "metadata"
  >,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      keyId: envelope.keyId,
      metadata: envelope.metadata,
      version: envelope.version,
    }),
    "utf8",
  );
}

export function encryptPostApplicationCredentials(
  credentials: PostApplicationCredentials,
  keys: CredentialKeys = {},
): PostApplicationCredentialEnvelope {
  const key = resolvePrimaryKey(keys);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const metadata = summarizePostApplicationCredentials(credentials);
  cipher.setAAD(envelopeAad({ version: 1, keyId: "primary", metadata }));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    keyId: "primary",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    metadata,
  };
}

export function decryptPostApplicationCredentials(
  envelope: PostApplicationCredentialEnvelope,
  keys: CredentialKeys = {},
): { credentials: PostApplicationCredentials; shouldReencrypt: boolean } {
  const primaryKey = resolvePrimaryKey(keys);
  const previousKey = resolvePreviousKey(keys);
  const candidates = [
    { key: primaryKey, shouldReencrypt: false },
    ...(previousKey ? [{ key: previousKey, shouldReencrypt: true }] : []),
  ];

  for (const candidate of candidates) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        candidate.key,
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAAD(envelopeAad(envelope));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(plaintext) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid credential plaintext.");
      }
      return {
        credentials: parsed as PostApplicationCredentials,
        shouldReencrypt: candidate.shouldReencrypt,
      };
    } catch {
      // Try a configured rotation key without exposing ciphertext or plaintext.
    }
  }

  throw serviceUnavailable(
    "Post-application credentials could not be decrypted.",
  );
}
