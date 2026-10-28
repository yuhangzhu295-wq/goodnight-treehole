ALTER TABLE "DecisionRecord"
ADD COLUMN "cooldownUntil" TIMESTAMP(3),
ADD COLUMN "outcome" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "DecisionRecord_userId_cooldownUntil_idx"
ON "DecisionRecord"("userId", "cooldownUntil");
