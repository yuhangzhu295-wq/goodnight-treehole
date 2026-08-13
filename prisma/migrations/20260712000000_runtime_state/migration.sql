-- Runtime-state persistence baseline. Existing production-style tables are synced from
-- prisma/schema.prisma; this migration records the aggregate repository used by the API.
CREATE TABLE IF NOT EXISTS "RuntimeState" (
  "id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimeState_pkey" PRIMARY KEY ("id")
);
