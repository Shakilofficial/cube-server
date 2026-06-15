import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import {
  JwtAuthGuard,
  JwtUser,
  Roles,
  RolesGuard,
  UserRole,
  ResponseMessage,
} from '@cube/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Reviews retrieved successfully')
  findAll(
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewService.findAll({ productId, status, page, limit });
  }

  @Get(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.reviewService.findOne(id);
  }

  // ─── Customer ─────────────────────────────────────────────────────────────

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Review submitted successfully')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(user.sub, dto);
  }

  // ─── Votes ────────────────────────────────────────────────────────────────

  @Post(':id/vote')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Vote recorded')
  addVote(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.reviewService.addVote(id, user.sub);
  }

  @Delete(':id/vote')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Vote removed')
  removeVote(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.reviewService.removeVote(id, user.sub);
  }

  // ─── Moderation ──────────────────────────────────────────────────────────

  @Patch(':id/moderate')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review moderated successfully')
  moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewService.moderate(id, dto);
  }
}
