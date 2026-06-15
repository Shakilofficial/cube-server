import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PRODUCT_EVENTS, paginationHelper } from '@cube/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ProductService } from '../product/product.service';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: ProductService,
    @Inject('PRODUCT_EVENTS_QUEUE') private readonly eventClient: ClientProxy,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Submit Review
  // ─────────────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateReviewDto) {
    // Ensure product exists and is ACTIVE
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found.`);
    if (product.status !== 'ACTIVE') {
      throw new ForbiddenException('Reviews can only be submitted for active products.');
    }

    // One review per user per product (enforced by DB unique index too)
    const existing = await this.prisma.productReview.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this product.');
    }

    const review = await this.prisma.productReview.create({
      data: {
        productId: dto.productId,
        userId,
        rating: dto.rating,
        comment: dto.comment,
        status: 'PENDING',
      },
    });

    return review;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // List Reviews
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(options: {
    productId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const where: any = {};
    if (options.productId) where.productId = options.productId;
    if (options.status) where.status = options.status;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
    await this.syncProductRating(review.productId);

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
    const count = await this.prisma.reviewHelpfulVote.count({ where: { reviewId } });
    await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { helpfulVotes: count },
    });

    return { message: 'Vote recorded.' };
  }

  async removeVote(reviewId: string, userId: string) {
    await this.findOne(reviewId);

    await this.prisma.reviewHelpfulVote
      .delete({ where: { userId_reviewId: { userId, reviewId } } })
      .catch(() => {}); // Silently ignore if vote doesn't exist

    const count = await this.prisma.reviewHelpfulVote.count({ where: { reviewId } });
    await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { helpfulVotes: count },
    });

    return { message: 'Vote removed.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async syncProductRating(productId: string): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          brand: true,
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
          categories: { include: { category: true } },
          _count: { select: { reviews: true } },
        },
      });
      if (!product) return;

      const doc = await this.productService.buildProductDocument(product);
      this.eventClient.emit(PRODUCT_EVENTS.UPDATED, doc);
    } catch (err: any) {
      this.logger.warn(`Failed to sync product rating: ${err.message}`);
    }
  }
}
