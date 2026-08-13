CREATE TABLE "HiddenPost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HiddenPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HiddenPost_userId_postId_key" ON "HiddenPost"("userId", "postId");
CREATE INDEX "HiddenPost_userId_createdAt_idx" ON "HiddenPost"("userId", "createdAt");

ALTER TABLE "HiddenPost"
  ADD CONSTRAINT "HiddenPost_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HiddenPost"
  ADD CONSTRAINT "HiddenPost_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
