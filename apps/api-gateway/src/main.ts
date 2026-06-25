import { Logger, logStartupBanner } from "@cube/logger";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { STATUS_CODES } from "http";
import { AppModule } from "./app.module";
import { getGatewayConfig } from "./config/gateway.config";
import { checkConnectionWithRetry } from "./utils/connection.utils";
import { registerRoutes } from "./routes/route";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = getGatewayConfig();
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.enableCors({ origin: config.ALLOWED_ORIGINS?.split(",") });

  // Root health check routes
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get("/", (req: any, res: any) => {
    res.json({
      status: STATUS_CODES.OK,
      message: "API Gateway is running",
      timestamp: new Date().toISOString(),
    });
  });

  expressApp.get("/health", (req: any, res: any) => {
    res.json({
      status: STATUS_CODES.OK,
      message: "API Gateway is running",
      timestamp: new Date().toISOString(),
    });
  });

  // Proxy routes registered via the clean factory helper
  registerRoutes(app, config);

  await app.listen(config.PORT);

  // Delay connection checks slightly to allow downstream services to begin booting
  setTimeout(async () => {
    const [
      authUp,
      userUp,
      notificationUp,
      redisUp,
      productUp,
      searchUp,
      inventoryUp,
      offerUp,
    ] = await Promise.all([
      checkConnectionWithRetry(config.AUTH_SERVICE_URL, 3001),
      checkConnectionWithRetry(config.USER_SERVICE_URL, 3002),
      checkConnectionWithRetry(config.NOTIFICATION_SERVICE_URL, 3003),
      checkConnectionWithRetry(config.REDIS_URL, 6379),
      checkConnectionWithRetry(config.PRODUCT_SERVICE_URL, 3004),
      checkConnectionWithRetry(config.SEARCH_SERVICE_URL, 3005),
      checkConnectionWithRetry(config.INVENTORY_SERVICE_URL, 3006),
      checkConnectionWithRetry(config.OFFER_SERVICE_URL, 3007),
    ]);

    logStartupBanner("API Gateway", {
      Port: config.PORT,
      Environment: process.env.NODE_ENV || "development",
      "Auth Microservice": authUp,
      "User Microservice": userUp,
      "Notification Microservice": notificationUp,
      "Redis Cache": redisUp,
      "Product Microservice": productUp,
      "Search Microservice": searchUp,
      "Inventory Microservice": inventoryUp,
      "Offer Microservice": offerUp,
    });
  }, 1000);
}
bootstrap();
