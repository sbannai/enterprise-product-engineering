import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, verify } from "node:crypto";

export interface OidcLoginTransactionStore {
  createLoginTransaction(input: { stateHash: string; nonceHash: string; pkceVerifierCiphertext: string; issuer: string; redirectUri: string; expiresAt: Date }): Promise<void>;
  consumeLoginTransaction(state: string): Promise<{ nonceHash: string; pkceVerifierCiphertext: string; issuer: string; redirectUri: string } | null>;
}
export interface ProviderNeutralOidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  pkceEncryptionKey: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}
interface OidcDiscovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; }
interface JwkSet { keys: Array<JsonWebKey & { kid?: string; use?: string; alg?: string }> }
interface JwtHeader { alg: string; kid: string; typ?: string; }
interface JwtClaims { iss: string; sub: string; aud: string | string[]; exp: number; iat?: number; nbf?: number; nonce: string; azp?: string; [key: string]: unknown; }

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function b64url(value: Buffer): string { return value.toString("base64url"); }
function parseJsonSegment<T>(segment: string): T {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length > 65536) throw new Error("EPER_OIDC_JWT_FORMAT_INVALID");
  try { return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T; }
  catch { throw new Error("EPER_OIDC_JWT_FORMAT_INVALID"); }
}
function validHttpsUrl(value: string, allowLocalHttp = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("EPER_OIDC_URL_INVALID"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocalHttp && local && url.protocol === "http:")) throw new Error("EPER_OIDC_HTTPS_REQUIRED");
  if (url.username || url.password || url.hash) throw new Error("EPER_OIDC_URL_INVALID");
  return url;
}
function encryptVerifier(value: string, secret: string): string {
  if (secret.length < 32) throw new Error("EPER_OIDC_PKCE_ENCRYPTION_KEY_REQUIRED");
  const key = createHash("sha256").update(secret, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", b64url(iv), b64url(cipher.getAuthTag()), b64url(ciphertext)].join(".");
}
function decryptVerifier(value: string, secret: string): string {
  if (secret.length < 32) throw new Error("EPER_OIDC_PKCE_ENCRYPTION_KEY_REQUIRED");
  const [version, ivPart, tagPart, cipherPart, extra] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !cipherPart || extra !== undefined) throw new Error("EPER_OIDC_PKCE_CIPHERTEXT_INVALID");
  try {
    const key = createHash("sha256").update(secret, "utf8").digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(cipherPart, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("EPER_OIDC_PKCE_CIPHERTEXT_INVALID"); }
}

export class ProviderNeutralOidcClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private discoveryCache?: { value: OidcDiscovery; expiresAt: number };
  private jwksCache?: { value: JwkSet; expiresAt: number };

  constructor(private readonly config: ProviderNeutralOidcConfig) {
    validHttpsUrl(config.issuer, true);
    const redirect = validHttpsUrl(config.redirectUri, true);
    if (!config.clientId.trim() || config.clientId.length > 512 || redirect.toString() !== new URL(config.redirectUri).toString()) throw new Error("EPER_OIDC_CONFIGURATION_INVALID");
    if (config.pkceEncryptionKey.length < 32) throw new Error("EPER_OIDC_PKCE_ENCRYPTION_KEY_REQUIRED");
    this.fetcher = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async beginLogin(store: OidcLoginTransactionStore): Promise<{ authorizationUrl: string; state: string }> {
    const discovery = await this.discovery();
    const state = b64url(randomBytes(32));
    const nonce = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    await store.createLoginTransaction({
      stateHash: sha256(state), nonceHash: sha256(nonce),
      pkceVerifierCiphertext: encryptVerifier(verifier, this.config.pkceEncryptionKey),
      issuer: this.config.issuer, redirectUri: this.config.redirectUri,
      expiresAt: new Date(this.now().getTime() + 5 * 60_000),
    });
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return { authorizationUrl: url.toString(), state };
  }

  async completeLogin(store: OidcLoginTransactionStore, code: string, state: string): Promise<{ issuer: string; subject: string; claims: JwtClaims }> {
    if (!code.trim() || code.length > 4096 || !state.trim() || state.length > 256) throw new Error("EPER_OIDC_CALLBACK_INVALID");
    const transaction = await store.consumeLoginTransaction(state);
    if (!transaction || transaction.issuer !== this.config.issuer || transaction.redirectUri !== this.config.redirectUri) {
      throw new Error("EPER_OIDC_STATE_INVALID_OR_REPLAYED");
    }
    const discovery = await this.discovery();
    const verifier = decryptVerifier(transaction.pkceVerifierCiphertext, this.config.pkceEncryptionKey);
    const form = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri,
      code_verifier: verifier,
    });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (this.config.clientSecret) headers.authorization = "Basic " + Buffer.from(this.config.clientId + ":" + this.config.clientSecret).toString("base64");
    else form.set("client_id", this.config.clientId);
    const response = await this.fetcher(discovery.token_endpoint, {
      method: "POST", headers, body: form, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("EPER_OIDC_TOKEN_EXCHANGE_FAILED");
    const tokenPayload = await response.json() as { id_token?: unknown };
    if (typeof tokenPayload.id_token !== "string") throw new Error("EPER_OIDC_ID_TOKEN_MISSING");
    const claims = await this.validateIdToken(tokenPayload.id_token, discovery);
    if (sha256(claims.nonce) !== transaction.nonceHash) throw new Error("EPER_OIDC_NONCE_INVALID");
    return { issuer: claims.iss, subject: claims.sub, claims };
  }

  private async discovery(): Promise<OidcDiscovery> {
    if (this.discoveryCache && this.discoveryCache.expiresAt > this.now().getTime()) return this.discoveryCache.value;
    const issuer = this.config.issuer.replace(/\/$/, "");
    const endpoint = issuer + "/.well-known/openid-configuration";
    const response = await this.fetcher(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("EPER_OIDC_DISCOVERY_FAILED");
    const value = await response.json() as OidcDiscovery;
    if (!value || value.issuer !== this.config.issuer || typeof value.authorization_endpoint !== "string" ||
        typeof value.token_endpoint !== "string" || typeof value.jwks_uri !== "string") throw new Error("EPER_OIDC_DISCOVERY_INVALID");
    validHttpsUrl(value.authorization_endpoint, true); validHttpsUrl(value.token_endpoint, true); validHttpsUrl(value.jwks_uri, true);
    this.discoveryCache = { value, expiresAt: this.now().getTime() + 5 * 60_000 };
    return value;
  }

  private async jwks(discovery: OidcDiscovery, force = false): Promise<JwkSet> {
    if (!force && this.jwksCache && this.jwksCache.expiresAt > this.now().getTime()) return this.jwksCache.value;
    const response = await this.fetcher(discovery.jwks_uri, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("EPER_OIDC_JWKS_FAILED");
    const value = await response.json() as JwkSet;
    if (!value || !Array.isArray(value.keys)) throw new Error("EPER_OIDC_JWKS_INVALID");
    this.jwksCache = { value, expiresAt: this.now().getTime() + 5 * 60_000 };
    return value;
  }

  private async validateIdToken(token: string, discovery: OidcDiscovery): Promise<JwtClaims> {
    if (token.length > 65536) throw new Error("EPER_OIDC_JWT_TOO_LARGE");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("EPER_OIDC_JWT_FORMAT_INVALID");
    const header = parseJsonSegment<JwtHeader>(parts[0]);
    const claims = parseJsonSegment<JwtClaims>(parts[1]);
    if (!["RS256", "PS256", "ES256"].includes(header.alg) || typeof header.kid !== "string" || !header.kid) throw new Error("EPER_OIDC_JWT_ALGORITHM_UNSUPPORTED");
    let jwks = await this.jwks(discovery);
    let jwk = jwks.keys.find(key => key.kid === header.kid && (!key.use || key.use === "sig") && (!key.alg || key.alg === header.alg));
    if (!jwk) { jwks = await this.jwks(discovery, true); jwk = jwks.keys.find(key => key.kid === header.kid && (!key.use || key.use === "sig") && (!key.alg || key.alg === header.alg)); }
    if (!jwk) throw new Error("EPER_OIDC_SIGNING_KEY_NOT_FOUND");
    if ((header.alg === "RS256" || header.alg === "PS256") && jwk.kty !== "RSA" ||
        header.alg === "ES256" && (jwk.kty !== "EC" || jwk.crv !== "P-256")) throw new Error("EPER_OIDC_SIGNING_KEY_TYPE_INVALID");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const signed = Buffer.from(parts[0] + "." + parts[1], "ascii");
    const signature = Buffer.from(parts[2], "base64url");
    const verifyOptions = header.alg === "PS256"
      ? { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
      : header.alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" as const } : publicKey;
    if (!verify("sha256", signed, verifyOptions, signature)) throw new Error("EPER_OIDC_SIGNATURE_INVALID");
    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== this.config.issuer || !audience.includes(this.config.clientId) ||
        audience.length > 1 && claims.azp !== this.config.clientId ||
        claims.azp !== undefined && claims.azp !== this.config.clientId ||
        !Number.isFinite(claims.exp) || claims.exp <= nowSeconds ||
        claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > nowSeconds) ||
        claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60) ||
        typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 512 ||
        typeof claims.nonce !== "string" || !claims.nonce) throw new Error("EPER_OIDC_ID_TOKEN_CLAIMS_INVALID");
    return claims;
  }
}
