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

  // ------------------------------------------------------------------
  // ReplyPreset
  // ------------------------------------------------------------------

  /**
   * Enabled presets in display order.
   *
   * The five `first5_preset_*` chips the C-end shows are **hardcoded in the route**, not stored, and
   * stay there: they are the product's minimum guaranteed reply choices for an empty install. Only the
   * stored presets are read from here. That split is deliberate and is why the route merges the two
   * and de-duplicates by text.
   */
  async listPublicPresets() {
    return this.prisma.replyPreset.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listPresetsForAdmin() {
    return this.prisma.replyPreset.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createPreset(input: { text: string; scene?: string; sortOrder?: number }) {
    const text = input.text?.trim();
    if (!text) throw new BadRequestException('回复预设内容不能为空');
    const sortOrder = input.sortOrder ?? (await this.prisma.replyPreset.count());
    return this.prisma.replyPreset.create({
      data: { text, scene: input.scene ?? 'comfort', sortOrder, enabled: true },
    });
  }

  async updatePreset(id: string, patch: { text?: string; scene?: string; enabled?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.replyPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('回复预设不存在');
    const data: Record<string, unknown> = {};
    if (patch.text !== undefined) {
      const text = patch.text.trim();
      if (!text) throw new BadRequestException('回复预设内容不能为空');
      data.text = text;
    }
    if (patch.scene !== undefined) data.scene = patch.scene;
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    return this.prisma.replyPreset.update({ where: { id }, data });
  }

  async deletePreset(id: string) {
    const existing = await this.prisma.replyPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('回复预设不存在');
    await this.prisma.replyPreset.delete({ where: { id } });
    return { ok: true, deleted: existing };
  }

  // ------------------------------------------------------------------
  // FeedbackCategory
  // ------------------------------------------------------------------

  /**
   * Enabled categories in display order, for the feedback form.
   *
   * An operator controls which categories exist, so an empty or all-disabled table is a real state the
   * form must handle rather than something to paper over with an invented category. The route returns
   * what is enabled; the C-end shows its own "other" path when the list is empty.
   */
  async listPublicCategories() {
    return this.prisma.feedbackCategory.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Every category for the console, each with its ticket count.
   *
   * The count is computed by the database with a `groupBy`, not by loading every ticket into memory
   * and filtering - the previous route did the latter, which is why it could not be converted before
   * `FeedbackCategory` was: it read the legacy `feedbackTickets` array for its tally. This reads the
   * table, so it works whether or not `FeedbackTicket` is itself registered yet.
   */
  async listCategoriesForAdmin() {
    const categories = await this.prisma.feedbackCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    const counts = await this.prisma.feedbackTicket.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
    });
    const tally = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    return categories.map((category) => ({
      ...category,
      ticketCount: tally.get(category.id) ?? 0,
    }));
  }

  async createCategory(input: { name: string; sortOrder?: number }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('分类名称不能为空');
    const sortOrder = input.sortOrder ?? (await this.prisma.feedbackCategory.count());
    return this.prisma.feedbackCategory.create({ data: { name, sortOrder, enabled: true } });
  }

  async updateCategory(id: string, patch: { name?: string; enabled?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.feedbackCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('反馈分类不存在');
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new BadRequestException('分类名称不能为空');
      data.name = name;
    }
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    return this.prisma.feedbackCategory.update({ where: { id }, data });
  }

  /** True when any ticket still points at this category, so the console refuses to remove it. */
  async categoryHasTickets(categoryId: string) {
    const count = await this.prisma.feedbackTicket.count({ where: { categoryId } });
    return count > 0;
  }

  async findCategory(id: string) {
    const existing = await this.prisma.feedbackCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('反馈分类不存在');
    return existing;
  }

  async deleteCategory(id: string) {
    const existing = await this.findCategory(id);
    await this.prisma.feedbackCategory.delete({ where: { id } });
    return { ok: true, deleted: existing };
  }

  // ------------------------------------------------------------------
  // FeedbackTicket
  // ------------------------------------------------------------------

  /**
   * Creates a ticket for `userId`.
   *
   * The category is resolved here rather than in the route: a missing or disabled category is a 400,
   * and the category row is read in the same statement set as the insert, so the pair converts
   * together with `FeedbackCategory` (see the design's §2a). A ticket can never be filed against a
   * category that is not in the table at insert time.
   */
  async createTicket(input: {
    userId: string;
    content: string;
    categoryId?: string;
    sourcePage?: string;
    screenshots?: string[];
  }) {
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) throw new BadRequestException('反馈内容不能为空');
    if (content.length > 500) throw new BadRequestException('反馈内容不能超过 500 字');

    const requestedId = typeof input.categoryId === 'string' ? input.categoryId.trim() : '';
    const category = requestedId
      ? await this.prisma.feedbackCategory.findUnique({ where: { id: requestedId } })
      : await this.prisma.feedbackCategory.findFirst({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } });
    if (!category || !category.enabled) throw new BadRequestException('请选择可用的反馈分类');

    const sourcePage =
      typeof input.sourcePage === 'string' && input.sourcePage.trim() ? input.sourcePage.trim() : '/pages/help/feedback';
    if (!sourcePage.startsWith('/pages/') || sourcePage.length > 160) {
      throw new BadRequestException('反馈来源页面不合法');
    }

    return this.prisma.feedbackTicket.create({
      data: {
        userId: input.userId,
        categoryId: category.id,
        sourcePage,
        content,
        status: 'open',
        priority: 'medium',
        screenshots: input.screenshots ?? [],
      },
    });
  }

  /** The caller's own tickets, newest first. */
  async listTicketsForUser(userId: string) {
    return this.prisma.feedbackTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }
}
