import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { PrismaModule } from "../../core/prisma/prisma.module";
import { SearchModule } from "../../core/search/search.module";
import { UserAuthHelper } from "./helpers/user-auth.helper";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [ProfileController],
  providers: [ProfileService, UserAuthHelper],
  exports: [ProfileService, UserAuthHelper],
})
export class ProfileModule {}
