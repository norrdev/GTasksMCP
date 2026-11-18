function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Public HTTPS origin of this server, e.g. https://mcp.example.com (no trailing slash) */
  publicUrl: new URL(required("PUBLIC_URL")),
  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  /** Only this Google account may use the server. */
  allowedEmail: required("ALLOWED_EMAIL").toLowerCase(),
  /** Redirect URIs the MCP client (Claude) is allowed to use. */
  redirectUris: (
    process.env.ALLOWED_REDIRECT_URIS ??
    "https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

/**
 * OAuth issuer identifier. Must equal the URL the metadata is published under
 * (RFC 8414), i.e. the bare origin with no trailing slash.
 */
export const ISSUER = config.publicUrl.origin;

/** Google redirects here; we forward to the MCP client's redirect URI with our own `iss`. */
export const GOOGLE_CALLBACK_URL = new URL("/oauth/callback", config.publicUrl).href;

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/tasks",
];
