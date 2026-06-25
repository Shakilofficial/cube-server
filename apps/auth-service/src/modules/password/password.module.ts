import { Module } from "@nestjs/common";
import { PasswordController } from "./password.controller";
import { PasswordService } from "./password.service";
import { MessagingModule } from "@cube/messaging";

@Module({
  imports: [MessagingModule],
  controllers: [PasswordController],
  providers: [PasswordService],
})
export class PasswordModule {}
