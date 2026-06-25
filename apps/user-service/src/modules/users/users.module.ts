import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { ProfileModule } from "../profile/profile.module";
import { SearchModule } from "../../core/search/search.module";

@Module({
  imports: [ProfileModule, SearchModule],
  controllers: [UsersController],
})
export class UsersModule {}
