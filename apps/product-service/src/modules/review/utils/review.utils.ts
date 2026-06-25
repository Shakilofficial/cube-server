import { QueryReviewDto } from "../dto/query-review.dto";

export function buildWhereClause(query: QueryReviewDto): any {
  const where: any = {};
  if (query.productId) where.productId = query.productId;
  if (query.status) where.status = query.status;
  return where;
}
