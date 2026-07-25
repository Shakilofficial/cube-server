-- DropIndex: redundant with the unique index already present on this column
DROP INDEX "Product_slug_idx";

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE INDEX "ReviewHelpfulVote_reviewId_idx" ON "ReviewHelpfulVote"("reviewId");

-- AddCheckConstraint
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- Search: pg_trgm-backed GIN indexes so ILIKE '%term%' on name/description can use an index
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Product_description_trgm_idx" ON "Product" USING gin ("description" gin_trgm_ops);
