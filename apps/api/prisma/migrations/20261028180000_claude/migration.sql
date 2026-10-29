-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('INTERVIEW', 'DRAFT');

-- CreateTable
CREATE TABLE "ApiCredential" (
    "userId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "tag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "status" "CredentialStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "KeyCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "rocketId" TEXT NOT NULL,
    "part" "PartKind" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "model" VARCHAR(64) NOT NULL,
    "replyStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rocketId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeyCheck_userId_createdAt_idx" ON "KeyCheck"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_rocketId_part_idx" ON "ChatSession"("rocketId", "part");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_rocketId_idx" ON "UsageEvent"("rocketId");

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyCheck" ADD CONSTRAINT "KeyCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_rocketId_fkey" FOREIGN KEY ("rocketId") REFERENCES "Rocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_rocketId_fkey" FOREIGN KEY ("rocketId") REFERENCES "Rocket"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Written by hand: rules Prisma cannot express. The schema points here.

-- A rocket has at most one open chat session, so two taps on "Start session" cannot open two.
CREATE UNIQUE INDEX "ChatSession_rocketId_open_key" ON "ChatSession"("rocketId") WHERE "status" = 'OPEN';

-- A session is closed exactly when it has a closing time.
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_closed_check"
  CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- A message always has words in it.
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_content_check"
  CHECK (char_length("content") > 0);

-- A saved key has a 12-byte IV, a 16-byte GCM tag, something to decrypt, and 4 characters shown.
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_shape_check"
  CHECK (octet_length("iv") = 12 AND octet_length("tag") = 16 AND octet_length("ciphertext") > 0
    AND char_length("last4") = 4 AND "keyVersion" >= 1);

-- Token counts are never negative.
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_tokens_check"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "cacheReadTokens" >= 0 AND "cacheWriteTokens" >= 0);
