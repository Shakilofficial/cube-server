import pino from "pino";
import { AsyncLocalStorage } from "async_hooks";
import { Injectable, LoggerService, Module } from "@nestjs/common";

export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
  userId?: string;
  traceId?: string;
}>();

export const pinoLogger = pino(
  process.env.NODE_ENV !== "production"
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        level: process.env.LOG_LEVEL ?? "info",
        formatters: {
          log(obj) {
            const ctx = requestContext.getStore();
            return { ...obj, ...ctx };
          },
        },
      },
);

@Injectable()
export class Logger implements LoggerService {
  private getContextAndMsg(message: any, optionalParams: any[]) {
    let context = "";
    let msg = message;
    if (optionalParams.length > 0) {
      context = optionalParams[optionalParams.length - 1];
    }
    return { context, msg };
  }

  log(message: any, ...optionalParams: any[]) {
    const { context, msg } = this.getContextAndMsg(message, optionalParams);
    pinoLogger.info(context ? { context } : {}, msg);
  }

  error(message: any, ...optionalParams: any[]) {
    const { context, msg } = this.getContextAndMsg(message, optionalParams);
    const trace = optionalParams.length > 1 ? optionalParams[0] : undefined;
    pinoLogger.error(
      trace ? { context, trace } : context ? { context } : {},
      msg,
    );
  }

  warn(message: any, ...optionalParams: any[]) {
    const { context, msg } = this.getContextAndMsg(message, optionalParams);
    pinoLogger.warn(context ? { context } : {}, msg);
  }

  debug(message: any, ...optionalParams: any[]) {
    const { context, msg } = this.getContextAndMsg(message, optionalParams);
    pinoLogger.debug(context ? { context } : {}, msg);
  }

  verbose(message: any, ...optionalParams: any[]) {
    const { context, msg } = this.getContextAndMsg(message, optionalParams);
    pinoLogger.trace(context ? { context } : {}, msg);
  }
}

export function logStartupBanner(
  serviceName: string,
  details: Record<string, any>,
) {
  const width = 60;
  const border = "─".repeat(width - 2);
  console.log(`\x1b[36m┌${border}┐\x1b[0m`);

  // Center Title
  const titleText = `  ${serviceName.toUpperCase()}  `;
  const padLength = Math.max(0, Math.floor((width - 2 - titleText.length) / 2));
  const titleLine =
    " ".repeat(padLength) +
    titleText +
    " ".repeat(width - 2 - padLength - titleText.length);
  console.log(`\x1b[36m│\x1b[1;35m${titleLine}\x1b[0;36m│\x1b[0m`);

  console.log(`\x1b[36m├${border}┤\x1b[0m`);

  for (const [key, val] of Object.entries(details)) {
    let statusStr = "";
    if (typeof val === "boolean") {
      statusStr = val
        ? "\x1b[1;32m✔ CONNECTED\x1b[0;36m"
        : "\x1b[1;31m✘ OFFLINE\x1b[0;36m";
    } else {
      statusStr = `\x1b[1;32m${val}\x1b[0;36m`;
    }

    // Key-value spacing
    const keyPart = `  ${key}: `;
    const cleanVal =
      typeof val === "boolean"
        ? val
          ? "✔ CONNECTED"
          : "✘ OFFLINE"
        : String(val);
    const lineContentLength = keyPart.length + cleanVal.length;
    const padding = " ".repeat(Math.max(0, width - 4 - lineContentLength));

    console.log(
      `\x1b[36m│\x1b[0m${keyPart}${statusStr}${padding}\x1b[36m│\x1b[0m`,
    );
  }

  console.log(`\x1b[36m└${border}┘\x1b[0m`);
}

@Module({
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}

import * as net from "net";
import { URL } from "url";

export async function checkTcpConnection(
  urlStr: string,
  defaultPort: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!urlStr) {
        resolve(false);
        return;
      }
      const sanitizedUrl = urlStr
        .replace(/^amqp/i, "http")
        .replace(/^redis/i, "http");
      const parsed = new URL(sanitizedUrl);
      const host = parsed.hostname || "localhost";
      const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;

      const socket = net.createConnection({ host, port, timeout: 1500 });

      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", () => {
        resolve(false);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}
