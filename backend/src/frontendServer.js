const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");

const app = express();
const port = Number(process.env.FRONTEND_PORT || 3000);
const frontendBuildPath = path.resolve(__dirname, "../../frontend/dist");
const indexPath = path.join(frontendBuildPath, "index.html");

// The backend API runs on this same machine. The browser only talks to this
// server (port 3000); anything under /api is forwarded to the backend.
const apiHost = process.env.API_HOST || "127.0.0.1";
const apiPort = Number(process.env.API_PORT || 4000);

if (!fs.existsSync(indexPath)) {
  throw new Error(
    `Frontend build not found at ${indexPath}. Build the frontend before starting this service.`,
  );
}

app.use("/api", (req, res) => {
  const proxyReq = http.request(
    {
      host: apiHost,
      port: apiPort,
      method: req.method,
      path: req.originalUrl,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    console.error("API proxy error:", error.message);
    if (!res.headersSent) {
      res
        .status(502)
        .json({ error: { message: "Backend API is not reachable." } });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
});

app.use(
  express.static(frontendBuildPath, {
    maxAge: "1y",
    immutable: true,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

app.get("*", (req, res) => {
  res.sendFile(indexPath);
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Nexxus Admin Console frontend listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down frontend server.`);
  server.close((error) => {
    if (error) {
      console.error("Frontend server failed to close cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.on("error", (error) => {
  console.error(
    "Frontend server failed to start or encountered an error.",
    error,
  );
  process.exitCode = 1;
});
