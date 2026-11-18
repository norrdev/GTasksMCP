import express from "express";
import {
  mcpAuthRouter,
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, GOOGLE_SCOPES, ISSUER } from "./config.js";
import { authProvider, oauthCallback } from "./auth.js";
import { createServer } from "./server.js";
import { privacyPage } from "./privacy.js";

const app = express();
app.set("trust proxy", 1); // behind Caddy/Traefik
app.disable("x-powered-by");

const issuerUrl = config.publicUrl;
const resourceUrl = new URL("/mcp", config.publicUrl);

// The SDK serialises the issuer as URL.href, which adds a trailing slash
// ("https://host/"). Clients compare it byte-for-byte with the URL the metadata
// was fetched from (RFC 8414) and with the `iss` we return (RFC 9207), so serve
// both metadata documents ourselves with the bare origin. Registered before
// mcpAuthRouter so these win.
const oauthMetadata = {
  ...createOAuthMetadata({ provider: authProvider, issuerUrl, scopesSupported: GOOGLE_SCOPES }),
  issuer: ISSUER,
  authorization_response_iss_parameter_supported: true,
};
const protectedResourceMetadata = {
  resource: resourceUrl.href,
  authorization_servers: [ISSUER],
  scopes_supported: GOOGLE_SCOPES,
  resource_name: "Google Tasks",
};
const sendJson = (body: object) => (_req: express.Request, res: express.Response) => {
  res.set("Access-Control-Allow-Origin", "*").json(body);
};
app.get("/.well-known/oauth-authorization-server", sendJson(oauthMetadata));
app.get(new URL(getOAuthProtectedResourceMetadataUrl(resourceUrl)).pathname, sendJson(protectedResourceMetadata));

app.get("/oauth/callback", oauthCallback);

app.use(
  mcpAuthRouter({
    provider: authProvider,
    issuerUrl,
    resourceServerUrl: resourceUrl,
    scopesSupported: GOOGLE_SCOPES,
    resourceName: "Google Tasks",
  }),
);

const auth = requireBearerAuth({
  verifier: authProvider,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
});

// Stateless Streamable HTTP: a fresh server + transport per request.
app.post("/mcp", auth, express.json({ limit: "1mb" }), async (req, res) => {
  const server = createServer(req.auth!.token);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("mcp error", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

const notAllowed = (_: express.Request, res: express.Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

app.get("/healthz", (_req, res) => void res.send("ok"));
app.get("/privacy", privacyPage);

app.listen(config.port, () => console.log(`google-tasks-mcp listening on :${config.port} (${config.publicUrl.origin})`));
