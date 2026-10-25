import type { RequestHandler } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { getFacilitatorUrl, getNetwork, getPayToAddress, PaymentsConfigError } from "./config.js";

// Seller side: protects an endpoint so callers must pay before they get the response.
// The facilitator checks the payment and submits it to Solana devnet.

let resourceServer: x402ResourceServer | null = null;

function getResourceServer(): x402ResourceServer {
  resourceServer ??= new x402ResourceServer(
    new HTTPFacilitatorClient({ url: getFacilitatorUrl() }),
  ).register(getNetwork(), new ExactSvmScheme());
  return resourceServer;
}

export interface PaidRouteOptions {
  /** Price in US dollars, e.g. "$0.01". Paid in devnet USDC. */
  price: string;
  description: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Express middleware that puts an x402 paywall in front of one endpoint:
 *
 *   app.get("/premium-data", paidRoute("GET /premium-data", () => ({ price: "$0.01", description: "…" })), handler);
 *
 * The route string must match the method and path the middleware is mounted on.
 * The paywall is built on the first request, so the server starts without any env vars
 * and without calling the facilitator. Payment is only settled if the handler
 * responds with status < 400.
 */
export function paidRoute(route: `${HttpMethod} /${string}`, options: () => PaidRouteOptions): RequestHandler {
  const [method, path] = route.split(" ");
  let middleware: RequestHandler | null = null;
  return (req, res, next) => {
    // x402 only charges requests that match `route`. If it doesn't match where this is mounted,
    // refuse instead of silently serving the endpoint for free.
    const mountedPath: unknown = req.route?.path;
    if (mountedPath !== path || (req.method !== method && !(req.method === "HEAD" && method === "GET"))) {
      res.status(500).json({
        error: `paidRoute("${route}") is mounted on ${req.method} ${String(mountedPath)}. Use the same method and path.`,
      });
      return;
    }
    try {
      if (!middleware) {
        const { price, description } = options();
        middleware = paymentMiddleware(
          {
            [route]: {
              accepts: [{ scheme: "exact", price, network: getNetwork(), payTo: getPayToAddress() }],
              description,
            },
          },
          getResourceServer(),
        );
      }
    } catch (err) {
      if (err instanceof PaymentsConfigError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
    return middleware(req, res, next);
  };
}
