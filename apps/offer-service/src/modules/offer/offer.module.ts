import { Module } from "@nestjs/common";
import { OfferController } from "./offer.controller";
import { OfferService } from "./offer.service";
import { OfferCalculatorService } from "./offer-calculator.service";
import { OfferHelper } from "./helpers/offer.helper";

@Module({
  controllers: [OfferController],
  providers: [OfferService, OfferCalculatorService, OfferHelper],
  exports: [OfferService, OfferCalculatorService, OfferHelper],
})
export class OfferModule {}
