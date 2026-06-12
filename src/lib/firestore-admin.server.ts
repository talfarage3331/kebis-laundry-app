/**
 * Server-only Firestore REST client (admin — bypasses security rules).
 *
 * The Firebase Web SDK does NOT work reliably inside the Worker runtime and
 * is subject to security rules. All server-side Firestore reads/writes go
 * through the official Firestore REST API authenticated with the
 * service-account OAuth token.
 */
import { getGoogleAccessToken, getFirebaseProjectId } from "./fcm-admin.server";

const FS_BASE = "https://firestore.googleapis.com/v1";

function docsRoot(): string {
  return `projects/${getFirebaseProjectId()}/databases/(default)/documents`;
}

async function fsRequest(pathSuffix: string, body: unknown): Promise<any> {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${FS_BASE}/${docsRoot()}${pathSuffix}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Firestore REST ${pathSuffix} failed: ${res.status} ${JSON.stringify(json)}`
    );
  }
  return json;
}

// ─── Value helpers ──────────────────────────────────────────────
export function getStringArrayField(fields: any, name: string): string[] {
  const values = fields?.[name]?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  return values.map((v: any) => v?.stringValue).filter(Boolean);
}

export interface UserDoc {
  /** Full resource name: projects/.../documents/users/{id} */
  name: string;
  fields: any;
}

// ─── Queries ────────────────────────────────────────────────────
async function runUsersQuery(where: any): Promise<UserDoc[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "users" }],
      where,
      limit: 200,
    },
  };
  const rows = (await fsRequest(":runQuery", body)) as any[];
  return rows
    .filter((r) => r?.document?.name)
    .map((r) => ({ name: r.document.name, fields: r.document.fields || {} }));
}

export async function findUsersByEmail(email: string): Promise<UserDoc[]> {
  return runUsersQuery({
    fieldFilter: {
      field: { fieldPath: "email" },
      op: "EQUAL",
      value: { stringValue: email },
    },
  });
}

export async function findUsersByRole(roles: string[]): Promise<UserDoc[]> {
  return runUsersQuery({
    fieldFilter: {
      field: { fieldPath: "role" },
      op: "IN",
      value: {
        arrayValue: { values: roles.map((r) => ({ stringValue: r })) },
      },
    },
  });
}

export async function findUsersWithToken(token: string): Promise<UserDoc[]> {
  return runUsersQuery({
    fieldFilter: {
      field: { fieldPath: "fcmTokens" },
      op: "ARRAY_CONTAINS",
      value: { stringValue: token },
    },
  });
}

// ─── Writes ─────────────────────────────────────────────────────
/** Append an FCM token to users/{docName}.fcmTokens (deduplicated). */
export async function appendFcmToken(docName: string, token: string): Promise<void> {
  await fsRequest(":commit", {
    writes: [
      {
        transform: {
          document: docName,
          fieldTransforms: [
            {
              fieldPath: "fcmTokens",
              appendMissingElements: { values: [{ stringValue: token }] },
            },
            { fieldPath: "fcmTokensUpdatedAt", setToServerValue: "REQUEST_TIME" },
          ],
        },
      },
    ],
  });
}

/** Remove an FCM token from users/{docName}.fcmTokens. */
export async function removeFcmTokenFromDoc(docName: string, token: string): Promise<void> {
  await fsRequest(":commit", {
    writes: [
      {
        transform: {
          document: docName,
          fieldTransforms: [
            {
              fieldPath: "fcmTokens",
              removeAllFromArray: { values: [{ stringValue: token }] },
            },
          ],
        },
      },
    ],
  });
}

/** Increment users/{docName}.unreadCount by `by` (powers the PWA app badge). */
export async function incrementUnreadCount(docName: string, by = 1): Promise<void> {
  await fsRequest(":commit", {
    writes: [
      {
        transform: {
          document: docName,
          fieldTransforms: [
            { fieldPath: "unreadCount", increment: { integerValue: String(by) } },
            { fieldPath: "unreadUpdatedAt", setToServerValue: "REQUEST_TIME" },
          ],
        },
      },
    ],
  });
}

/** Write an anonymous token record under fcmTokens/{id} (no matching user). */
export async function saveOrphanToken(token: string, userEmail: string | null): Promise<void> {
  const docId = token.slice(0, 100).replace(/[^A-Za-z0-9_-]/g, "_");
  await fsRequest(":commit", {
    writes: [
      {
        update: {
          name: `${docsRoot()}/fcmTokens/${docId}`,
          fields: {
            token: { stringValue: token },
            userEmail: userEmail ? { stringValue: userEmail } : { nullValue: null },
          },
        },
        updateTransforms: [
          { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
        ],
      },
    ],
  });
}
