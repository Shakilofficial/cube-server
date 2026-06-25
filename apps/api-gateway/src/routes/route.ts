import { NestExpressApplication } from "@nestjs/platform-express";
import { createServiceProxy } from "../utils/proxy.utils";
import { GatewayConfig } from "../config/gateway.config";

/**
 * Registers all microservice proxy routes on the API Gateway.
 */
export function registerRoutes(
  app: NestExpressApplication,
  config: GatewayConfig,
): void {
  app.use("/v1/auth", createServiceProxy("/v1/auth", config.AUTH_SERVICE_URL));
  app.use(
    "/v1/users",
    createServiceProxy("/v1/users", config.USER_SERVICE_URL),
  );
  app.use(
    "/v1/products",
    createServiceProxy("/v1/products", config.PRODUCT_SERVICE_URL),
  );
  app.use(
    "/v1/brands",
    createServiceProxy("/v1/brands", config.PRODUCT_SERVICE_URL),
  );
  app.use(
    "/v1/categories",
    createServiceProxy("/v1/categories", config.PRODUCT_SERVICE_URL),
  );
  app.use(
    "/v1/reviews",
    createServiceProxy("/v1/reviews", config.PRODUCT_SERVICE_URL),
  );
  app.use(
    "/v1/search",
    createServiceProxy("/v1/search", config.SEARCH_SERVICE_URL),
  );
  app.use(
    "/v1/inventory",
    createServiceProxy("/v1/inventory", config.INVENTORY_SERVICE_URL),
  );
  app.use(
    "/v1/offers",
    createServiceProxy("/v1/offers", config.OFFER_SERVICE_URL),
  );
}
