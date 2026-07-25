-- DropIndex: redundant with the unique index already present on each column
DROP INDEX "User_email_idx";
DROP INDEX "User_phone_idx";
DROP INDEX "RefreshToken_tokenHash_idx";

-- CreateIndex: missing indexes on FK columns
CREATE INDEX "BackupCode_mfaConfigId_idx" ON "BackupCode"("mfaConfigId");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "OauthAccount_userId_idx" ON "OauthAccount"("userId");
