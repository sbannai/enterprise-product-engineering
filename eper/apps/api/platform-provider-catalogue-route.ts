import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipalFromStore } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformAdminCredentialStore } from "../../packages/identity/postgres-platform-admin-credential-store.js";
import { ProviderCatalogueConflictError, type PostgresProviderCatalogueRepository, type ProviderCatalogueStatus } from "../../packages/integrations/postgres-provider-catalogue-repository.js";

const ROOT = "/platform/admin/provider-definitions";
const MAX_BODY_BYTES = 24 * 1024;
const VERSIONED_JSON = "application/vnd.eper.v1+json";

function respond(request: IncomingMessage, response: ServerResponse, status: number, body: Record<string, unknown>): void {
  const accept = request.headers.accept ?? "";
  const versioned = accept.split(",").some(value => value.split(";")[0].trim().toLowerCase() === VERSIONED_JSON);
  response.writeHead(status, {
    "content-type": versioned ? VERSIONED_JSON : "application/json; charset=utf-8",
    "cache-control": "no-store", "pragma": "no-cache", "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(versioned ? { data: body } : body));
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("PROVIDER_CATALOGUE_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("PROVIDER_CATALOGUE_INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROVIDER_CATALOGUE_JSON_OBJECT_REQUIRED");
  return value as Record<string, unknown>;
}
function exactKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every(key => allowed.includes(key));
}
function correlationId(request: IncomingMessage): string {
  const value = request.headers["x-correlation-id"];
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID();
}

/** Product Admin-only provider catalogue API. No customer session or role can authorize this surface. */
export async function handlePlatformProviderCatalogueRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    credentialStore?: PostgresPlatformAdminCredentialStore;
    repository?: PostgresProviderCatalogueRepository;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  if (pathname !== ROOT && !pathname.startsWith(ROOT + "/")) return false;
  const suffix = pathname.slice(ROOT.length);
  const lifecycle = /^\/([^/]+)\/(suspend|activate|deprecate)$/.exec(suffix);
  const item = /^\/([^/]+)$/.exec(suffix);
  if (suffix && !lifecycle && !item) { respond(request,response,404,{error:"not_found"}); return true; }
  if (process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED !== "true" ||
      process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED !== "true" ||
      !dependencies.credentialStore || !dependencies.repository || !dependencies.environment) {
    respond(request,response,404,{error:"not_found"}); return true;
  }
  const expectedMethod = !suffix ? (request.method === "GET" ? "GET" : "POST") :
    lifecycle ? "POST" : (request.method === "GET" ? "GET" : "PATCH");
  if (request.method !== expectedMethod) { respond(request,response,405,{error:"method_not_allowed"}); return true; }
  try {
    const principal = await resolvePlatformAdminPrincipalFromStore(request.headers.authorization, dependencies.credentialStore);
    if (!principal) { respond(request,response,401,{error:"unauthorized"}); return true; }
    if (!principal.permissions.includes("provider_catalogue:manage")) {
      respond(request,response,403,{error:"provider_catalogue_forbidden"}); return true;
    }
    const context = { actorId: principal.platformActorId, correlationId: correlationId(request),
      environment: dependencies.environment };
    if (!suffix) {
      if (request.method === "GET") {
        const url = new URL(request.url ?? ROOT, "http://localhost");
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw === null ? 50 : Number(limitRaw);
        const providers = await dependencies.repository.list(limit);
        respond(request,response,200,{providers}); return true;
      }
      const body = await readBody(request);
      const allowed = ["providerKey","displayName","adapterKey","adapterVersion","capabilities","authModes","configurationSchema"];
      if (!exactKeys(body,allowed) || allowed.some(key => body[key] === undefined)) {
        respond(request,response,400,{error:"provider_catalogue_create_fields_invalid"}); return true;
      }
      const provider = await dependencies.repository.create({...context,
        providerKey:body.providerKey as string, displayName:body.displayName as string,
        adapterKey:body.adapterKey as string, adapterVersion:body.adapterVersion as string,
        capabilities:body.capabilities as string[], authModes:body.authModes as string[],
        configurationSchema:body.configurationSchema as Record<string,unknown>});
      respond(request,response,201,{provider}); return true;
    }
    let providerKey: string;
    try { providerKey = decodeURIComponent((lifecycle ?? item)![1]); }
    catch { respond(request,response,400,{error:"provider_key_encoding_invalid"}); return true; }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(providerKey)) {
      respond(request,response,400,{error:"provider_key_invalid"}); return true;
    }
    if (item && request.method === "GET") {
      const provider = await dependencies.repository.get(providerKey);
      respond(request,response,provider ? 200 : 404,provider ? {provider} : {error:"provider_catalogue_not_found"}); return true;
    }
    const body = await readBody(request);
    if (lifecycle) {
      if (!exactKeys(body,["expectedVersion"]) || !Number.isSafeInteger(body.expectedVersion) ||
          Number(body.expectedVersion) < 1) {
        respond(request,response,400,{error:"provider_catalogue_expected_version_invalid"}); return true;
      }
      const status: ProviderCatalogueStatus = lifecycle[2] === "suspend" ? "SUSPENDED" :
        lifecycle[2] === "activate" ? "ACTIVE" : "DEPRECATED";
      const provider = await dependencies.repository.setStatus({...context,providerKey,
        expectedVersion:Number(body.expectedVersion),status});
      respond(request,response,200,{provider}); return true;
    }
    const allowed = ["expectedVersion","displayName","adapterKey","adapterVersion","capabilities","authModes","configurationSchema"];
    if (!exactKeys(body,allowed) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
      respond(request,response,400,{error:"provider_catalogue_update_fields_invalid"}); return true;
    }
    const provider = await dependencies.repository.update({...context,providerKey,
      expectedVersion:Number(body.expectedVersion),
      ...(body.displayName === undefined ? {} : {displayName:body.displayName as string}),
      ...(body.adapterKey === undefined ? {} : {adapterKey:body.adapterKey as string}),
      ...(body.adapterVersion === undefined ? {} : {adapterVersion:body.adapterVersion as string}),
      ...(body.capabilities === undefined ? {} : {capabilities:body.capabilities as string[]}),
      ...(body.authModes === undefined ? {} : {authModes:body.authModes as string[]}),
      ...(body.configurationSchema === undefined ? {} : {configurationSchema:body.configurationSchema as Record<string,unknown>}),
    });
    respond(request,response,200,{provider}); return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROVIDER_CATALOGUE_OPERATION_FAILED";
    const status = error instanceof ProviderCatalogueConflictError ? 409 :
      message.includes("NOT_FOUND") ? 404 :
      message.includes("INVALID") || message.includes("UNSUPPORTED") || message.includes("REGISTERED") ||
      message.includes("SCHEMA") || message.includes("SET_") || message.includes("FIELD_") ? 400 : 503;
    respond(request,response,status,{error:message}); return true;
  }
}
