import { Module } from "@nestjs/common";
import { AddressController } from "./address.controller";
import { AddressService } from "./address.service";
import { PrismaModule } from "../../core/prisma/prisma.module";
import { AddressHelper } from "./helpers/address.helper";

@Module({
  imports: [PrismaModule],
  controllers: [AddressController],
  providers: [AddressService, AddressHelper],
})
export class AddressModule {}
