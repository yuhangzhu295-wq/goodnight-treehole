import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export type AdminUserNoteRecord = {
  id: string;
  userId: string;
  authorAdminId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

/**
 * Database authority for `AdminUserNote` - an operator's note about a user.
 *
 * Append-only by design: saving adds a row rather than overwriting, and the "current" note is the
 * newest one that has not been retracted. The previous implementation wrote only an AuditLog row, so
 * the note was not business data and vanished on the next load (ISSUE-027); that is why the model
 * exists and why the users list reads a current note per user.
 *
 * Batch 4 model 5 (`BATCH4_LEGACY_FLUSH_RETIREMENT.md`). Nothing here depends on the flush: once
 * `DIRECT_DB_MODELS.AdminUserNote` is registered the flush neither hydrates the array nor sweeps it,
 * so these methods are the only reader and writer.
 */
@Injectable()
export class AdminNotesPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  /** Notes for one user, newest first, excluding retracted ones. */
  async listNotes(userId: string) {
    return this.prisma.adminUserNote.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async currentNote(userId: string) {
    return this.prisma.adminUserNote.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The newest note for each of `userIds`, in one query.
   *
   * The console's user list needs a current note per row. Asking per user would be one query per row
   * on a paginated list - the N+1 the legacy array did not have and which converting to the database
   * would otherwise introduce. The rows come back newest-first and the first one seen per user wins,
   * so the map holds exactly what `currentNote` would have returned for each.
   */
  async currentNotesForUsers(userIds: string[]): Promise<Map<string, AdminUserNoteRecord>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.adminUserNote.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const byUser = new Map<string, AdminUserNoteRecord>();
    for (const row of rows) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, row as unknown as AdminUserNoteRecord);
    }
    return byUser;
  }

  async createNote(input: { userId: string; authorAdminId: string; content: unknown }) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new NotFoundException('用户不存在');
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) throw new BadRequestException('备注内容不能为空');
    if (content.length > 500) throw new BadRequestException('备注内容不能超过 500 字');
    return this.prisma.adminUserNote.create({
      data: { userId: input.userId, authorAdminId: input.authorAdminId, content },
    });
  }

  /**
   * Soft delete: the note leaves the operator view without destroying the record, so a retraction is
   * still auditable. The row is scoped to its user, so a note id from another user is a 404 rather
   * than a cross-user retraction.
   */
  async deleteNote(userId: string, noteId: string) {
    const existing = await this.prisma.adminUserNote.findFirst({ where: { id: noteId, userId, deletedAt: null } });
    if (!existing) throw new NotFoundException('备注不存在');
    const retracted = await this.prisma.adminUserNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });
    return { ok: true, deleted: retracted };
  }
}
