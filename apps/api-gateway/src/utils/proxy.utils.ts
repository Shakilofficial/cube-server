import { RequestHandler } from "express";
import proxy from "express-http-proxy";

/**
 * Creates an express-http-proxy middleware instance for a specific microservice url.
 * Handles standard routing path mapping and correlation-id header decoration.
 */
export function createServiceProxy(
  path: string,
  serviceUrl: string,
): RequestHandler {
  return proxy(serviceUrl, {
    proxyReqPathResolver: (req) => {
      return path + req.url;
    },
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      if (srcReq.headers["x-correlation-id"]) {
        proxyReqOpts.headers["x-correlation-id"] =
          srcReq.headers["x-correlation-id"];
      }
      return proxyReqOpts;
    },
  }) as RequestHandler;
}
