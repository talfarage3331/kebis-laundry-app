/**
 * server-env.ts
 * ─────────────────────────────────────────────────────────────────
 * Captures and exposes the Cloudflare Worker environment bindings
 * globally for server-side code (route handlers, etc.).
 */

export const SERVICE_ACCOUNT_FALLBACK = {
  type: "service_account",
  project_id: "kevisa-5983b",
  private_key_id: "3881862ca1c2fa250e89a8b5e9344e8437567aca",
  private_key:
    "-----BEGIN PRIVATE KEY-----\n" +
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpo/vfEufvPROf\n" +
    "WKlB8pKxDtLNYXMvCiiDr3GPDlHS9Cp9ad/UcEH9Czmc53ka7CpkHwfp77T9q/Vs\n" +
    "z/29P3jP5bG4WGm8b8T9GWjcWnPUwooum0bQCGtPrOewTDj9DwBQIHN3TBO8+Bwq\n" +
    "9X84wvsrveYBDU5OC25KTkOIneUNOKjjdod/xddThbLeC/6CxAmLl5LWKcHpm/Tu\n" +
    "4jwvINecn+U1COW8FWygvEWtLb4ZuAJmh4HuXSsUHSsE+yzdGVpQi8DYzyErtiLd\n" +
    "w2pPb5aSKzi4tmKxtNsqA84cPkX8udWRymbLkOOsi8aErPemQ6bvr68Htj4ciYws\n" +
    "IVd5OMi9AgMBAAECggEACG7aYZrtFI+cIbF/YS53xt1WXYyGNJTZcem/PYM9eOfC\n" +
    "PfpM/MtOKHq4n47CjolQy9SJaO0i5Ee6W1v/6zq+x3z4Z6eI2BZ+poNZxbcpvMOl\n" +
    "VA723KFyg43e9adltNocTp9nsLWY4e276WcgrtfDMzKNPsj5zHeVK79LbFJHFZqs\n" +
    "/Uil7MnFe1bOFqOcQzxiOJiv5iLICFM+zJARc4SBtOz//eNdRtXeb+SxKIOGAwJA\n" +
    "wtxt5+M9LpwvYvzdnMxw1AqQDNsTtSPSM0iwG7w9bcJF+L44cVHoVpStU5r0u3E5\n" +
    "Ss5cBrM15XNvLG5xPEkRh5Ar2xLMRYObzeWUNBvxaQKBgQDTa1UBlLkwGYJmvWMM\n" +
    "1QTRa400IVifkyrrlR2a2Hp08mrrHZkvn5AuK/MrvTdegLq0J9WoHhw4lZPEv5iv\n" +
    "T5qPBsXY/gpxJrHrLu9V0SXwdWZ7F6ZJJ5R68hMjTrP1DsyrRlLLhO8tefCfp1bE\n" +
    "puQ+5V3vuhpUZPZk2BV7mPvzdQKBgQDNaWMFXq5P+8NkoplT8HKxwjZz1NsgYMCx\n" +
    "C1TnkTTyfmjlq4wXWU8Cqf+wb99wlmiJX08n4BNkj9WTC/vC/v1/Vmto2l85vINZ\n" +
    "bi5GtegRipxphf2m8ZetY6/mcN/1hnMOdnoF3K8CjlvmZT9iq3rloUwg+CFnFUgg\n" +
    "RoiX4oE/KQKBgFb37QT0d+VoaPL4bxllO1Ema/SIzxr9gAde1MnQyTb4TbEgANbN\n" +
    "TZMgsyxH7tHqJGNdi49Xq4Y/SYUCx70+ArdZMuPbRNJc941mRj/IBFJRCPITvWyU\n" +
    "YojcsbCxfGePSfQevopHydesNKaIQLIucO/KjITDynby/URoexXXzbTNAoGAPpUQ\n" +
    "LS+mjgnXgw6jBlboqs3QB0RfqqKvsoEQUikEZ6kpzmeQnACCuP4QP7Il8khw+wGF\n" +
    "vVFgty+3U0DAaK2FkElFGkIF5zJPFm0iPjrnxIhllSTUngtXOeV4Tw4uvcBDx7FD\n" +
    "BgwxaebziuNoB2jVXabh6d2PV7e9LNAwh43j8NkCgYEAzCxlw6OelIWUa1HzZkvm\n" +
    "eQScFbpz69iolOTfQJeSMQDBwGNNfRRCzqjABtN+V5ESKzwE7O06IhOR2foww2ju\n" +
    "vqoWLdWv+Zvz0DTLb54MUtdFYh3QRp1kZ1tudDHjTuz7Ois7LJepMvRCVtkN92Fl\n" +
    "+nfxSf9Ns1YpbmEaDE+Km3g=\n" +
    "-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@kevisa-5983b.iam.gserviceaccount.com",
  client_id: "101947721606480397342",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40kevisa-5983b.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

let globalEnv: any = null;

/**
 * Capture environment bindings from the Worker fetch handler
 */
export function setServerEnv(env: any) {
  globalEnv = env;
}

/**
 * Get the environment bindings (VAPID keys, etc.)
 */
export function getServerEnv(): Record<string, string | undefined> {
  const env = globalEnv || (typeof process !== "undefined" ? process.env : {});
  const merged = { ...env };
  if (!merged.FIREBASE_SERVICE_ACCOUNT) {
    merged.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(SERVICE_ACCOUNT_FALLBACK);
  }
  return merged;
}
