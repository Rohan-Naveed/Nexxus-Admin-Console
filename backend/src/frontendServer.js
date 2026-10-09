const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const port = Number(process.env.FRONTEND_PORT || 3000);
const frontendBuildPath = path.resolve(__dirname, "../../frontend/dist");
const indexPath = path.join(frontendBuildPath, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error(
    `Frontend build not found at ${indexPath}. Build the frontend before starting this service.`,
  );
}

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

const server = app.listen(port, "127.0.0.1", () => {
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
  console.error("Frontend server failed to start or encountered an error.", error);
  process.exitCode = 1;
});
