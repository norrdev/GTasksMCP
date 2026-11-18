import type { Request, Response } from "express";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy – GTasks MCP</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #222; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #ddd; background: #111; } a { color: #8ab4f8; } }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.6rem; }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p>GTasks MCP is a personal, self-hosted connector that lets Claude read and manage the operator's own Google Tasks.
It is not offered to the public and accepts sign-ins only from a single allowlisted Google account.</p>

<h2>What data is accessed</h2>
<p>With your consent via Google OAuth, the service requests the scopes <code>openid</code>, <code>email</code> and
<code>https://www.googleapis.com/auth/tasks</code>. It uses them only to confirm your email address against the allowlist
and to list, create, update, complete and delete task lists and tasks when Claude asks it to.</p>

<h2>What data is stored</h2>
<p>Nothing is stored. The server has no database. Google access tokens are passed through to Claude and verified
against Google on each request (with an in-memory cache of up to 60 seconds). Task content is fetched from and sent to
Google Tasks on demand and is not logged or retained by this server.</p>

<h2>Sharing</h2>
<p>Data is exchanged only between Google, this server and Claude (Anthropic), as needed to perform the requested action.
It is never sold or shared with anyone else, and it is not used for advertising or model training by this service.</p>

<h2>Revoking access</h2>
<p>You can revoke access at any time at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
or by disconnecting the connector in Claude.</p>

<h2>Google API Services User Data Policy</h2>
<p>Use of information received from Google APIs adheres to the
<a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
including the Limited Use requirements.</p>

<h2>Contact</h2>
<p>Source code and contact: <a href="https://github.com/norrdev/GTasksMCP">github.com/norrdev/GTasksMCP</a>.</p>
</body>
</html>`;

export function privacyPage(_req: Request, res: Response) {
  res.type("html").send(html);
}
