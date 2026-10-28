-- CreateEnum
CREATE TYPE "PartKind" AS ENUM ('ENGINE', 'FUEL', 'BODY', 'AVIONICS', 'FINS', 'NOSE');

-- CreateEnum
CREATE TYPE "RocketStatus" AS ENUM ('BUILDING', 'LAUNCHED');

-- CreateEnum
CREATE TYPE "PartSource" AS ENUM ('CHAT', 'MANUAL');

-- CreateTable
CREATE TABLE "Rocket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "pitch" VARCHAR(200) NOT NULL,
    "status" "RocketStatus" NOT NULL DEFAULT 'BUILDING',
    "launchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rocket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "rocketId" TEXT NOT NULL,
    "kind" "PartKind" NOT NULL,
    "summary" VARCHAR(600) NOT NULL,
    "points" VARCHAR(200)[],
    "source" "PartSource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rocket_userId_status_updatedAt_idx" ON "Rocket"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Part_rocketId_kind_key" ON "Part"("rocketId", "kind");

-- AddForeignKey
ALTER TABLE "Rocket" ADD CONSTRAINT "Rocket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_rocketId_fkey" FOREIGN KEY ("rocketId") REFERENCES "Rocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Written by hand: checks Prisma cannot express. The schema points here.

-- A part has a list of points, at most 8 of them, and none of them is missing. Prisma never marks a
-- list column NOT NULL, so the list itself is checked here too.
ALTER TABLE "Part" ADD CONSTRAINT "Part_points_check"
  CHECK ("points" IS NOT NULL AND cardinality("points") <= 8 AND array_position("points", NULL) IS NULL);

-- A rocket is launched exactly when it has a launch time.
ALTER TABLE "Rocket" ADD CONSTRAINT "Rocket_launched_check"
  CHECK (("status" = 'LAUNCHED') = ("launchedAt" IS NOT NULL));
