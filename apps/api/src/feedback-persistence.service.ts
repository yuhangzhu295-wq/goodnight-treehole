import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for the operator-authored content FaqItem, FeedbackCategory,
 * ReplyPreset and FeedbackTicket.
 *
 * These four were the last "content" models still written through the legacy flush: the mapper
 * already read and upserted them, and `store.service.ts` swept them for absence, but every
 * route-level read and write went through the in-memory arrays. That is the dual-writer condition
 * `LEGACY_SWEEP_DATA_LOSS_AUDIT.md` §3.1 lists and Batch 4 retires
 * (`BATCH4_LEGACY_FLUSH_RETIREMENT.md`).
 *
 * Nothing here depends on the flush. Once `DIRECT_DB_MODELS.FaqItem` is registered, the flush
 * neither hydrates the array nor writes the table, so these methods are the only writer - and the
 * read-back check in the Batch 4 contract (`a row written directly to PostgreSQL is still returned
 * by the read path`) passes because reading goes to the same table.
 */
@Injectable()
export class FeedbackPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  // ------------------------------------------------------------------
  // FaqItem
  // ------------------------------------------------------------------

  /** Enabled FAQs in display order. This is what the C-end `feedback/faqs` route serves. */
  async listPublicFaqs() {
    return this.prisma.faqItem.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Every FAQ, for the console. No pagination here: the admin route applies it. */
  async listFaqsForAdmin() {
    return this.prisma.faqItem.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createFaq(input: { question: string; answer: string; sortOrder?: number }) {
    const question = input.question?.trim();
    const answer = input.answer?.trim();
    if (!question || !answer) throw new BadRequestException('问题和答案不能为空');
    // Appended, not prepended: the mapper reads these ordered by sortOrder asc, so a new FAQ belongs
    // at the end unless the operator says otherwise. The legacy route used `length + 1`, which is
    // the same intent but only correct for the array it was reading.
    const sortOrder = input.sortOrder ?? (await this.prisma.faqItem.count());
    return this.prisma.faqItem.create({
      data: { question, answer, sortOrder, enabled: true },
    });
  }

  async updateFaq(id: string, patch: { question?: string; answer?: string; enabled?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.faqItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ 不存在');

    const data: Record<string, unknown> = {};
    if (patch.question !== undefined) {
      const question = patch.question.trim();
      if (!question) throw new BadRequestException('问题和答案不能为空');
      data.question = question;
    }
    if (patch.answer !== undefined) {
      const answer = patch.answer.trim();
      if (!answer) throw new BadRequestException('问题和答案不能为空');
      data.answer = answer;
    }
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    return this.prisma.faqItem.update({ where: { id }, data });
  }

  /**
   * A hard delete, matching what the legacy route did (it filtered the row out and flushed, which
   * swept it away). Kept a delete rather than a soft `enabled=false` because that is the existing
   * behaviour; changing it would silently resurrect rows the console believes are gone.
   */
  async deleteFaq(id: string) {
    const existing = await this.prisma.faqItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ 不存在');
    await this.prisma.faqItem.delete({ where: { id } });
    return { ok: true, deleted: existing };
  }
}
