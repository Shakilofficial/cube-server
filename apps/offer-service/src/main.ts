import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { Logger, logStartupBanner } from "@cube/logger";
import { PrismaService } from "./core/prisma/prisma.service";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableVersioning({ type: VersioningType.URI });
  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(",") });

  const port = process.env.PORT || 3007;
  await app.listen(port);

  const prisma = app.get(PrismaService);
  let postgresConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch {
    postgresConnected = false;
  }

  logStartupBanner("Offer Service", {
    Port: port,
    Environment: process.env.NODE_ENV || "development",
    PostgreSQL: postgresConnected,
  });
}
bootstrap();
