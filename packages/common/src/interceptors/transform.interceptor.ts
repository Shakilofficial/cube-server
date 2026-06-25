import {
  Injectable,
  Inject,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Response } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { RESPONSE_MESSAGE_KEY } from "../decorators/response-message.decorator";
import { IApiResponse } from "../interfaces/api-response.interface";

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  IApiResponse<T>
> {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<IApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();

    const handlerMessage = this.reflector.get<string>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );
    const classMessage = this.reflector.get<string>(
      RESPONSE_MESSAGE_KEY,
      context.getClass(),
    );
    const defaultMessage =
      handlerMessage || classMessage || "Operation successful";

    return next.handle().pipe(
      map((data: any) => {
        const statusCode = response.statusCode || HttpStatus.OK;

        // If data is already formatted with the target envelope, return as-is
        if (
          data &&
          typeof data === "object" &&
          "success" in data &&
          "statusCode" in data &&
          "message" in data
        ) {
          return data;
        }

        // If data is paginated (has meta & data)
        if (
          data &&
          typeof data === "object" &&
          "data" in data &&
          "meta" in data
        ) {
          return {
            statusCode,
            success: true,
            message: data.message || defaultMessage,
            meta: data.meta,
            data: data.data,
          };
        }

        return {
          statusCode,
          success: true,
          message:
            data && typeof data === "object" && "message" in data
              ? data.message
              : defaultMessage,
          data:
            data && typeof data === "object" && "data" in data
              ? data.data
              : data !== undefined
                ? data
                : null,
        };
      }),
    );
  }
}
