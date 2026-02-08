-- AlterTable
ALTER TABLE "users" ADD COLUMN "cognito_username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_username_key" ON "users"("cognito_username");

