CREATE TABLE "StableSelfProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profile" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StableSelfProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StableSelfProfile_userId_key" ON "StableSelfProfile"("userId");
CREATE INDEX "StableSelfProfile_updatedAt_idx" ON "StableSelfProfile"("updatedAt");

ALTER TABLE "StableSelfProfile"
ADD CONSTRAINT "StableSelfProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
