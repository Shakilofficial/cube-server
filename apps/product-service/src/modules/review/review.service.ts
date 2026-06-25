import { paginationHelper } from "@cube/common";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ReviewStatus } from "../../../prisma/generated/prisma/enums";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { ReviewHelper } from "./helpers/review.helper";
import { buildWhereClause } from "./utils/review.utils";

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewHelper: ReviewHelper,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Submit Review
  // ─────────────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateReviewDto) {
    // Ensure product exists and is ACTIVE
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product)
      throw new NotFoundException(`Product ${dto.productId} not found.`);
    if (product.status !== "ACTIVE") {
      throw new ForbiddenException(
        "Reviews can only be submitted for active products.",
      );
    }

    // One review per user per product (enforced by DB unique index too)
    const existing = await this.prisma.productReview.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) {
      throw new ConflictException("You have already reviewed this product.");
    }

    const review = await this.prisma.productReview.create({
      data: {
        productId: dto.productId,
        userId,
        rating: dto.rating,
        comment: dto.comment,
        status: "PENDING",
      },
    });

    return review;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // List Reviews
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(options: {
    productId?: string;
    status?: ReviewStatus;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const where = buildWhereClause(options);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { votes: true } } },
      }),
    ]);

    return { meta: { page, limit, total }, data };
  }

  async findOne(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
      include: { _count: { select: { votes: true } } },
    });
    if (!review) throw new NotFoundException(`Review ${id} not found.`);
    return review;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Moderate
  // ─────────────────────────────────────────────────────────────────────────

  async moderate(id: string, dto: ModerateReviewDto) {
    await this.findOne(id);

    const review = await this.prisma.productReview.update({
      where: { id },
      data: { status: dto.status },
    });

    // Recompute avg rating and publish updated product event
    await this.reviewHelper.syncProductRating(review.productId);

    return review;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpful Votes
  // ─────────────────────────────────────────────────────────────────────────

  async addVote(reviewId: string, userId: string) {
    await this.findOne(reviewId);

    // Upsert — idempotent
    await this.prisma.reviewHelpfulVote.upsert({
      where: { userId_reviewId: { userId, reviewId } },
      create: { userId, reviewId },
      update: {},
    });

    // Update the denormalised helpfulVotes count
    const count = await this.prisma.reviewHelpfulVote.count({
      where: { reviewId },
    });
    await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { helpfulVotes: count },
    });

    return { message: "Vote recorded." };
  }

  async removeVote(reviewId: string, userId: string) {
    await this.findOne(reviewId);

    await this.prisma.reviewHelpfulVote
      .delete({ where: { userId_reviewId: { userId, reviewId } } })
      .catch(() => {});

    const count = await this.prisma.reviewHelpfulVote.count({
      where: { reviewId },
    });
    await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { helpfulVotes: count },
    });

    return { message: "Vote removed." };
  }
}
