import type { Request, Response } from "express";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { config, GOOGLE_CALLBACK_URL, GOOGLE_SCOPES, ISSUER } from "./config.js";

/**
 * Google's redirect goes to our /oauth/callback, so the MCP client's own
 * redirect URI and state ride along inside the state we hand to Google.
 */
type WrappedState = { r: string; s?: string };

function wrapState(redirectUri: string, state?: string): string {
  const payload: WrappedState = { r: redirectUri, ...(state !== undefined ? { s: state } : {}) };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function unwrapState(raw: unknown): WrappedState | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as WrappedState;
    if (typeof v.r !== "string" || (v.s !== undefined && typeof v.s !== "string")) return undefined;
    // Only ever redirect to a pre-approved client redirect URI.
    return config.redirectUris.includes(v.r) ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * GET /oauth/callback — receives Google's authorization response and relays
 * code (or error) to the MCP client, stamping our issuer as `iss` (RFC 9207)
 * instead of Google's.
 */
export function oauthCallback(req: Request, res: Response) {
  const st = unwrapState(req.query.state);
  if (!st) {
    res.status(400).type("text").send("Invalid or missing OAuth state");
    return;
  }
  const out = new URL(st.r);
  const pick = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  const code = pick("code");
  if (code) {
    out.searchParams.set("code", code);
  } else {
    out.searchParams.set("error", pick("error") ?? "server_error");
    const desc = pick("error_description");
    if (desc) out.searchParams.set("error_description", desc);
  }
  if (st.s !== undefined) out.searchParams.set("state", st.s);
  out.searchParams.set("iss", ISSUER);
  res.redirect(out.toString());
}

const GOOGLE = {
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revocationUrl: "https://oauth2.googleapis.com/revoke",
  tokeninfoUrl: "https://oauth2.googleapis.com/tokeninfo",
};

/**
 * Google has no dynamic client registration, so the MCP client (Claude) is
 * handed our single pre-registered Google OAuth client.
 */
const fixedClient: OAuthClientInformationFull = {
  client_id: config.googleClientId,
  client_secret: config.googleClientSecret,
  redirect_uris: config.redirectUris,
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "client_secret_post",
};

type CacheEntry = { info: AuthInfo; until: number };
const cache = new Map<string, CacheEntry>();

async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.info;

  const res = await fetch(
    `${GOOGLE.tokeninfoUrl}?access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) throw new InvalidTokenError("Invalid or expired Google token");
  const data = (await res.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    scope?: string;
    expires_in?: string;
  };

  const scopes = (data.scope ?? "").split(" ");
  const verified = data.email_verified === true || data.email_verified === "true";
  if (data.aud !== config.googleClientId) {
    throw new InvalidTokenError("Token was issued for a different client");
  }
  if (!verified || data.email?.toLowerCase() !== config.allowedEmail) {
    throw new InvalidTokenError("This Google account is not allowed");
  }
  if (!scopes.includes("https://www.googleapis.com/auth/tasks")) {
    throw new InvalidTokenError("Token is missing the Tasks scope");
  }

  const ttl = Number(data.expires_in ?? 0);
  const info: AuthInfo = {
    token,
    clientId: config.googleClientId,
    scopes,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  cache.set(token, { info, until: Date.now() + Math.min(ttl, 60) * 1000 });
  return info;
}

class GoogleOAuthProvider extends ProxyOAuthServerProvider {
  constructor() {
    super({
      endpoints: {
        authorizationUrl: GOOGLE.authorizationUrl,
        tokenUrl: GOOGLE.tokenUrl,
        revocationUrl: GOOGLE.revocationUrl,
      },
      verifyAccessToken,
      getClient: async (id) => (id === config.googleClientId ? fixedClient : undefined),
    });
  }

  // Google needs offline access + consent to hand out refresh tokens, and
  // does not understand the RFC 8707 `resource` parameter.
  override async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const url = new URL(GOOGLE.authorizationUrl);
    url.search = new URLSearchParams({
      client_id: client.client_id,
      response_type: "code",
      redirect_uri: GOOGLE_CALLBACK_URL,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      login_hint: config.allowedEmail,
      state: wrapState(params.redirectUri, params.state),
    }).toString();
    res.redirect(url.toString());
  }

  override exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    verifier?: string,
    _redirectUri?: string,
  ) {
    // Google must see the same redirect_uri it redirected to: our callback.
    return super.exchangeAuthorizationCode(client, code, verifier, GOOGLE_CALLBACK_URL);
  }

  override exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string) {
    return super.exchangeRefreshToken(client, refreshToken);
  }
}

export const authProvider = new GoogleOAuthProvider();
