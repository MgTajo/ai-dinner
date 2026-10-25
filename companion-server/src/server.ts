import { existsSync, readdirSync } from "node:fs";
import express, { type ErrorRequestHandler, type Express } from "express";
import { renderLanding } from "./landing.js";
import { modules } from "./modules.js";

// Secrets come from .env.local (git-ignored) or the real environment. Never hard-code them.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fine, environment variables are used as they are.
}

const app = express();
app.use(express.json({ limit: "100kb" }));

// Browsers block a web page from calling a server on another port or domain unless the server
// allows it (CORS). Pages on this computer (localhost, e.g. an Expo app in the browser) are
// allowed; add your deployed site with CORS_ALLOW_ORIGIN=https://your-site.example.
const extraOrigins = (process.env.CORS_ALLOW_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || extraOrigins.includes(origin))) {
    res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization, PAYMENT-SIGNATURE, X-PAYMENT", "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
  }
  next();
});

// Home: lists every feature included in this service. Browsers get a readable page
// (src/landing.ts); code (curl, fetch, other agents) gets JSON.
app.get("/", (req, res) => {
  if (req.accepts(["json", "html"]) === "html") {
    res.type("html").send(renderLanding(modules, `${req.protocol}://${req.get("host")}`));
    return;
  }
  res.json({ service: "superteam-agent-service", modules });
});

// Every file in src/routes adds its own endpoints. Each module drops a new file there,
// so adding a feature never means editing this file.
type RouteFile = { default: (app: Express) => void };
const routesDir = new URL("./routes/", import.meta.url);
if (existsSync(routesDir)) {
  const files = readdirSync(routesDir).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts")).sort();
  for (const file of files) {
    const route = (await import(new URL(file, routesDir).href)) as RouteFile;
    route.default(app);
  }
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found. GET / lists the available endpoints." });
});

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    // Client mistakes such as malformed JSON bodies.
    res.status(status).json({ error: err.message });
    return;
  }
  console.error("Request failed:", err);
  res.status(500).json({ error: "Internal server error. Check the server logs." });
};
app.use(onError);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
