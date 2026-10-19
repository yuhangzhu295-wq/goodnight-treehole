import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MediaAsset } from '@goodnight/shared-types';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `MediaAsset`.
 *
 * The last of the sixteen Batch 4 models. An asset is a file the user uploaded, so it has to be
 * rows and a filesystem object that agree: every write here is paired with the caller's own file
 * work, and the readers (`mediaByIds`, the diary/letter projections, the feedback screenshots)
 * all go through `readyByIds`.
 *
 * Registration is what stops the legacy flush from re-inserting the seed assets, so a file deleted
 * through the draft endpoint stays deleted after the next flush.
 */
@Injectable()
export class MediaAssetPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  /** The application shape: `createdAt` as a string, the same as the in-memory array held. */
  private static normalize(row: Record<string, any>): MediaAsset {
    return {
      id: row.id,
      userId: row.userId,
      storageKey: row.storageKey,
      url: row.url,
      mimeType: row.mimeType,
      size: Number(row.size ?? 0),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      usageType: row.usageType,
      status: row.status,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
  }

  async get(id: string): Promise<MediaAsset | null> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    return row ? MediaAssetPersistenceService.normalize(row) : null;
  }

  /** The upload a caller is about to reference. Owner-scoped and ready-only. */
  async findOwnedReady(id: string, userId: string): Promise<MediaAsset | null> {
    const row = await this.prisma.mediaAsset.findFirst({ where: { id, userId, status: 'ready' } });
    return row ? MediaAssetPersistenceService.normalize(row) : null;
  }

  async readyByIds(ids: string[]): Promise<MediaAsset[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids }, status: 'ready' } });
    const byId = new Map(rows.map((row: any) => [row.id, MediaAssetPersistenceService.normalize(row)]));
    return ids.map((id) => byId.get(id)).filter((asset): asset is MediaAsset => Boolean(asset));
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.mediaAsset.count({ where: { userId } });
  }

  async create(input: {
    id?: string;
    userId: string;
    storageKey: string;
    url: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    usageType: string;
    status?: string;
    createdAt?: Date;
  }) {
    const row = await this.prisma.mediaAsset.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        storageKey: input.storageKey,
        url: input.url,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width ?? 0,
        height: input.height ?? 0,
        usageType: input.usageType,
        status: input.status ?? 'ready',
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
    return MediaAssetPersistenceService.normalize(row);
  }

  async markDeleted(id: string) {
    const row = await this.prisma.mediaAsset.update({ where: { id }, data: { status: 'deleted' } });
    return MediaAssetPersistenceService.normalize(row);
  }

  /**
   * Soft-deletes an upload, per owner.
   *
   * The row is the authority on which ids exist, so a caller only ever learns about its own assets:
   * a foreign id is a 404 rather than an object whose owner the caller can then compare.
   */
  async deleteOwned(id: string, userId: string): Promise<MediaAsset> {
    const existing = await this.prisma.mediaAsset.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('图片不存在');
    return this.markDeleted(id);
  }

  /**
   * Whether this asset is attached to any mood or diary, by the join rows' own column.
   *
   * The join tables are keyed `mediaAssetId`, which is the only way to answer "is this file in use".
   * Passing the id where a `moodId` was expected answered a different question - whether a mood with
   * this id has posts, diaries or a letter - which is always false for an asset id, so the check
   * reported "not attached" for files that were attached and let the delete take them.
   */
  async isAttachedToAnyRow(mediaAssetId: string): Promise<boolean> {
    const [moodLinks, diaryLinks] = await Promise.all([
      this.prisma.moodAttachment.count({ where: { mediaAssetId } }),
      this.prisma.diaryAttachment.count({ where: { mediaAssetId } }),
    ]);
    return moodLinks > 0 || diaryLinks > 0;
  }

  /** Ids attached to any of the user's rows, used by the data-clearing paths. */
  async ownedReadyIds(userId: string, usageTypes?: string[]): Promise<string[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { userId, status: 'ready', ...(usageTypes?.length ? { usageType: { in: usageTypes } } : {}) },
      select: { id: true },    });
    return rows.map((row) => row.id);
  }

  /**
   * The archive exports of one journey, matched on the storage key.
   *
   * `MediaAsset` has no `journeyId` column, and adding one would need a migration that the
   * "applied migrations are immutable" rule forbids rewriting; the key already carries the journey
   * id by construction (`createJourneyArchiveExport` builds it), so this reads the same rows the
   * legacy array scan did.
   */
  async forJourneyArchiveExport(journeyId: string, userId: string): Promise<MediaAsset[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        userId,
        usageType: 'journey-archive-export',
        storageKey: { startsWith: `journey-archive-export-${journeyId}-` },
      },
    });
    return rows.map((row: any) => MediaAssetPersistenceService.normalize(row));
  }
}
