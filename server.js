import express from "express";
import cors from "cors";

// A simple MCP server that supports GitHub OAuth and exposes basic tools.
//
// This server demonstrates how to integrate a third-party OAuth provider
// (GitHub) with an MCP endpoint. Once a user completes the OAuth flow,
// ChatGPT can invoke tools that access the authenticated user's GitHub
// resources. Tool definitions are streamed via SSE on /sse, and tool
// invocations are handled via JSON over HTTP (POST routes).

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage for the GitHub access token. In a production system you
// would persist this in a database or a secure session store. Only one user
// is supported at a time in this minimal example.
let githubAccessToken = null;

// Determine our base URL. In production (Render) you should define
// BASE_URL as an environment variable. It will be used as the redirect_uri
// for the OAuth flow. When running locally it will default to localhost.
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 10000}`;

/**
 * Initiates the GitHub OAuth authorization flow.
 *
 * Redirects the user to GitHub's authorization endpoint with the client ID
 * and requested scopes. Upon success, GitHub will redirect back to the
 * /auth/github/callback endpoint with a code.
 */
app.get("/auth/github", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("GitHub client ID not configured");
  }
  // Request minimal scopes for reading user and repo information. Adjust
  // scopes here if you need additional permissions.
  const scopes = ["repo", "read:user"].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${BASE_URL}/auth/github/callback`,
    scope: scopes,
    allow_signup: "true",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

/**
 * Handles the OAuth callback from GitHub.
 *
 * Exchanges the authorization code for an access token and stores it in
 * memory. In this minimal example we simply acknowledge success to the
 * user. In a real system you might want to return an HTML page or
 * automatically close the window.
 */
app.get("/auth/github/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Missing OAuth code");
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("GitHub client credentials not configured");
  }
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) {
      return res.status(400).json({ error: data.error_description || data.error });
    }
    githubAccessToken = data.access_token;
    console.log("GitHub OAuth successful, token acquired");
    res.send("GitHub OAuth success! You can close this tab.");
  } catch (err) {
    console.error("Error exchanging GitHub code for token", err);
    res.status(500).send("Failed to retrieve access token");
  }
});

/**
 * Server-Sent Events endpoint for MCP tool discovery.
 *
 * When ChatGPT connects to /sse it expects to receive a stream of JSON
 * objects describing the available tools. Each tool must include a
 * name, description, and JSON schema for its parameters. Once the user
 * has authenticated via /auth/github, the tools can be invoked.
 */
app.get("/sse", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  // Define our available tools. These names must match the route names
  // implemented below (e.g., /listRepos and /getUser).
  const tools = {
    listRepos: {
      description: "List the authenticated user's GitHub repositories",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    getUser: {
      description: "Get the authenticated user's GitHub profile information",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  };
  const payload = {
    message: "GitHub tools ready",
    tools,
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
});

/**
 * Server-Sent Events endpoint on the root path.
 *
 * Some hosting providers (including Render) may route the root path of
 * a service to the first defined route instead of the intended path. In
 * production we expect ChatGPT to connect to `/sse`, but if a GET
 * request arrives at `/` we stream the same tool definitions. This
 * duplication ensures the server continues to work even when path
 * rewriting occurs at the platform level.
 */
app.get("/", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  const tools = {
    listRepos: {
      description: "List the authenticated user's GitHub repositories",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    getUser: {
      description: "Get the authenticated user's GitHub profile information",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  };
  const payload = {
    message: "GitHub tools ready",
    tools,
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
});

/**
 * Tool invocation: listRepos
 *
 * Returns an array of repositories for the authenticated user. This
 * endpoint must be called via POST with an empty JSON body. If the user
 * has not authenticated, a 401 error is returned.
 */
app.post("/listRepos", async (req, res) => {
  if (!githubAccessToken) {
    return res.status(401).json({ error: "GitHub OAuth required" });
  }
  try {
    const ghRes = await fetch("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${githubAccessToken}`,
        "User-Agent": "mcp-server",
      },
    });
    const repos = await ghRes.json();
    res.json(repos);
  } catch (err) {
    console.error("Error fetching GitHub repos", err);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

/**
 * Tool invocation: getUser
 *
 * Returns the authenticated user's GitHub profile. If the user has not
 * authenticated, a 401 error is returned.
 */
app.post("/getUser", async (req, res) => {
  if (!githubAccessToken) {
    return res.status(401).json({ error: "GitHub OAuth required" });
  }
  try {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${githubAccessToken}`,
        "User-Agent": "mcp-server",
      },
    });
    const user = await ghRes.json();
    res.json(user);
  } catch (err) {
    console.error("Error fetching GitHub user", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Launch the Express server. Use the PORT environment variable if provided,
// otherwise default to 10000. This allows the server to run on Render.
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MCP server with GitHub OAuth running on port ${PORT}`);
});