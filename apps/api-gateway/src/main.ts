import { checkTcpConnection, Logger, logStartupBanner } from '@cube/logger';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import proxy from 'express-http-proxy';
import { STATUS_CODES } from 'http';
import { AppModule } from './app.module';
import { getGatewayConfig } from './config/gateway.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = getGatewayConfig();
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.enableCors({ origin: config.ALLOWED_ORIGINS?.split(',') });

  // Root health check routes
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (req: any, res: any) => {
    res.json({
      status: STATUS_CODES.OK,
      message: 'API Gateway is running',
      timestamp: new Date().toISOString(),
    });
  });

  expressApp.get('/health', (req: any, res: any) => {
    res.json({
      status: STATUS_CODES.OK,
      message: 'API Gateway is running',
      timestamp: new Date().toISOString(),
    });
  });

  // Route /v1/auth/* to auth-service
  app.use('/v1/auth', proxy(config.AUTH_SERVICE_URL, {
    proxyReqPathResolver: (req) => {
      return '/v1/auth' + req.url;
    },
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      if (srcReq.headers['x-correlation-id']) {
        proxyReqOpts.headers['x-correlation-id'] = srcReq.headers['x-correlation-id'];
      }
      return proxyReqOpts;
    }
  }));

  // Route /v1/users/* to user-service
  app.use('/v1/users', proxy(config.USER_SERVICE_URL, {
    proxyReqPathResolver: (req) => {
      return '/v1/users' + req.url;
    },
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      if (srcReq.headers['x-correlation-id']) {
        proxyReqOpts.headers['x-correlation-id'] = srcReq.headers['x-correlation-id'];
      }
      return proxyReqOpts;
    }
  }));

  await app.listen(config.PORT);

  async function checkConnectionWithRetry(urlStr: string, defaultPort: number, retries = 8, delay = 1500): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
      const isUp = await checkTcpConnection(urlStr, defaultPort);
      if (isUp) return true;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return false;
  }

  // Delay connection checks slightly to allow downstream services to begin booting
  setTimeout(async () => {
    const [authUp, userUp, notificationUp, redisUp] = await Promise.all([
      checkConnectionWithRetry(config.AUTH_SERVICE_URL, 3001),
      checkConnectionWithRetry(config.USER_SERVICE_URL, 3002),
      checkConnectionWithRetry(config.NOTIFICATION_SERVICE_URL, 3003),
      checkConnectionWithRetry(config.REDIS_URL, 6379),
    ]);

    logStartupBanner('API Gateway', {
      'Port': config.PORT,
      'Environment': process.env.NODE_ENV || 'development',
      'Auth Microservice': authUp,
      'User Microservice': userUp,
      'Notification Microservice': notificationUp,
      'Redis Cache': redisUp,
    });
  }, 1000);
}
bootstrap();

