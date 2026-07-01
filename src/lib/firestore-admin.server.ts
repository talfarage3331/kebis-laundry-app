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
    throw new Error(`Firestore REST ${pathSuffix} failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function fsGetRequest(pathSuffix: string): Promise<any> {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${FS_BASE}/${docsRoot()}${pathSuffix}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Firestore REST GET ${pathSuffix} failed: ${res.status} ${JSON.stringify(json)}`);
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
  try {
    const body = {
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where,
        limit: 200,
      },
    };
    const rows = (await fsRequest(":runQuery", body)) as any[];
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r?.document?.name)
      .map((r) => ({ name: r.document.name, fields: r.document.fields || {} }));
  } catch (err) {
    console.error("[firestore-admin] runUsersQuery failed:", err);
    return [];
  }
}

export async function findUsersByEmail(email: string): Promise<UserDoc[]> {
  try {
    return await runUsersQuery({
      fieldFilter: {
        field: { fieldPath: "email" },
        op: "EQUAL",
        value: { stringValue: email },
      },
    });
  } catch (err) {
    console.error("[firestore-admin] findUsersByEmail failed:", err);
    return [];
  }
}

export async function findUsersByRole(roles: string[]): Promise<UserDoc[]> {
  try {
    return await runUsersQuery({
      fieldFilter: {
        field: { fieldPath: "role" },
        op: "IN",
        value: {
          arrayValue: { values: roles.map((r) => ({ stringValue: r })) },
        },
      },
    });
  } catch (err) {
    console.error("[firestore-admin] findUsersByRole failed:", err);
    return [];
  }
}

export async function findUsersWithToken(token: string): Promise<UserDoc[]> {
  try {
    return await runUsersQuery({
      fieldFilter: {
        field: { fieldPath: "fcmTokens" },
        op: "ARRAY_CONTAINS",
        value: { stringValue: token },
      },
    });
  } catch (err) {
    console.error("[firestore-admin] findUsersWithToken failed:", err);
    return [];
  }
}

export async function findUserById(userId: string): Promise<UserDoc | null> {
  try {
    const json = await fsGetRequest(`/users/${userId}`);
    if (json && json.name) {
      return {
        name: json.name,
        fields: json.fields || {},
      };
    }
    return null;
  } catch (err) {
    console.error(`[firestore-admin] failed to find user by id ${userId}:`, err);
    return null;
  }
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
        updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
      },
    ],
  });
}

/** Log a push notification attempt and details to notification_logs collection. */
export async function logNotification(data: {
  recipient: string;
  event: string;
  title: string;
  body: string;
  status: "success" | "failed";
  results?: any;
  error?: string;
}): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const fields: any = {
    recipient: { stringValue: data.recipient },
    event: { stringValue: data.event },
    title: { stringValue: data.title },
    body: { stringValue: data.body },
    status: { stringValue: data.status },
  };

  if (data.results) {
    fields.results = {
      stringValue: typeof data.results === "string" ? data.results : JSON.stringify(data.results),
    };
  }
  if (data.error) {
    fields.error = { stringValue: data.error };
  }

  await fsRequest(":commit", {
    writes: [
      {
        update: {
          name: `${docsRoot()}/notification_logs/${logId}`,
          fields,
        },
        updateTransforms: [{ fieldPath: "timestamp", setToServerValue: "REQUEST_TIME" }],
      },
    ],
  });
}

export function getDoubleValue(field: any): number | null {
  if (!field) return null;
  if (field.doubleValue !== undefined) {
    return Number(field.doubleValue);
  }
  if (field.integerValue !== undefined) {
    return Number(field.integerValue);
  }
  return null;
}

export function getCoordinates(field: any): { lat: number; lng: number } | null {
  const mapFields = field?.mapValue?.fields;
  if (!mapFields) return null;
  const lat = getDoubleValue(mapFields.lat);
  const lng = getDoubleValue(mapFields.lng);
  if (lat !== null && lng !== null) {
    return { lat, lng };
  }
  return null;
}

export async function createOrderAdmin(orderData: any): Promise<string> {
  const fields: any = {};
  for (const [key, val] of Object.entries(orderData)) {
    if (val === undefined || val === null) {
      fields[key] = { nullValue: null };
    } else if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((v) => {
            if (typeof v === "string") return { stringValue: v };
            return { stringValue: String(v) };
          }),
        },
      };
    } else if (typeof val === "object") {
      const mapFields: any = {};
      for (const [mk, mv] of Object.entries(val)) {
        if (mv === undefined || mv === null) {
          mapFields[mk] = { nullValue: null };
        } else if (typeof mv === "number") {
          mapFields[mk] = Number.isInteger(mv) ? { integerValue: String(mv) } : { doubleValue: mv };
        } else if (typeof mv === "string") {
          mapFields[mk] = { stringValue: mv };
        } else if (typeof mv === "boolean") {
          mapFields[mk] = { booleanValue: mv };
        }
      }
      fields[key] = { mapValue: { fields: mapFields } };
    }
  }

  const res = await fsRequest("/orders", { fields });
  if (res && res.name) {
    const parts = res.name.split("/");
    return parts[parts.length - 1];
  }
  throw new Error("Failed to create order document via REST");
}

