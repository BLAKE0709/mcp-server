import express from "express";
import cors from "cors";

// Create an Express application
const app = express();

// Enable CORS for all routes. This allows the MCP server to be called from any origin.
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

/*
 * Minimal MCP-compatible endpoint
 *
 * This endpoint streams responses using the Server-Sent Events (SSE) protocol.
 * ChatGPT's MCP connector expects an SSE endpoint that emits JSON-formatted
 * data for tool discovery and invocation. For demonstration purposes, this
 * endpoint simply sends a JSON payload containing a greeting message. In a
 * production system you would implement logic here to discover and execute
 * your tools.
 */
app.get("/sse", (req, res) => {
  // Set headers to establish an SSE connection
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  // Flush headers immediately
  res.flushHeaders();

  // Construct a JSON payload that conforms to the MCP format. This basic
  // example returns a greeting. You can expand this to include your tool
  // definitions and results.
  const payload = {
    message: "Hello from your MCP server!",
  };

  // Write the payload to the stream. The SSE protocol requires each chunk to
  // start with "data: " and end with two newlines.
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
});

// Start the server on the port specified by the PORT environment variable,
// defaulting to 10000. Render sets PORT automatically in production.
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
});