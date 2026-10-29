import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackStatus } from '@prisma/client';
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
   * Writes the categories a fresh install needs, and leaves the table alone otherwise.
   *
   * The legacy flush used to seed these from the store snapshot. Once `FeedbackCategory` was
   * registered the flush stopped writing the table, and a database that had never carried the rows
   * then served an empty list to every client - the feedback form had no type to choose, and its
   * submit was refused with "请选择可用的反馈分类". An operator still owns the table: this only fills an
   * empty one, and it never renames or re-enables a row the console has changed.
   */
  async ensureSeedCategories() {
    const existing = await this.prisma.feedbackCategory.count();
    if (existing > 0) return 0;
    await this.prisma.feedbackCategory.createMany({
      data: [
        { id: 'cat_1', name: '使用问题', sortOrder: 1, enabled: true },
        { id: 'cat_2', name: '内容建议', sortOrder: 2, enabled: true },
        { id: 'cat_3', name: '隐私与数据', sortOrder: 3, enabled: true },
      ],
      skipDuplicates: true,
    });
    return 3;
  }

  /**
   * Writes the FAQ entries a fresh install needs, and leaves the table alone otherwise.
   *
   * Same shape as the categories: the flush no longer writes this table, so a database that never
   * carried the rows would show an empty FAQ list on the help page and its "查看全部" link would lead
   * to nothing. The console remains the owner; this only fills an empty table.
   */
  async ensureSeedFaqs() {
    const existing = await this.prisma.faqItem.count();
    if (existing > 0) return 0;
    const items = [
      {
        id: 'faq_1',
        question: '树洞内容会公开我的身份吗？',
        answer: '不会。广场只展示匿名编号，个人身份不会出现在公开内容里。',
      },
      {
        id: 'faq_2',
        question: 'AI 回信是心理诊断吗？',
        answer: '不是。晚安树洞只提供情绪陪伴和整理，不做诊断或医疗建议。',
      },
      {
        id: 'faq_3',
        question: '为什么换设备后看不到以前的回信？',
        answer: '匿名身份由服务端签发的凭据确认，凭据只保存在原设备上。丢失后无法通过本应用恢复原身份的私密数据。',
      },
      {
        id: 'faq_4',
        question: '删除我的数据会删掉什么？',
        answer: '会从服务端删除你的日记、回信与收藏记录，此操作不可撤销。隐私与数据页面会说明当前生效的删除范围。',
      },
    ];
    await this.prisma.faqItem.createMany({
      data: items.map((item, index) => ({ ...item, sortOrder: index + 1, enabled: true })),
      skipDuplicates: true,
    });
    return items.length;
  }

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

  /**
   * Whether any ticket references this asset id.
   *
   * `screenshots` is `JSONB`, so the containment test runs in the database (`@>`) rather than by
   * reading every ticket's screenshots array into this process - which grew with the ticket table on
   * every draft delete. The id is passed as a parameter, never spliced into the query text.
   *
   * The legacy in-memory array only held tickets this instance had written, so a ticket created
   * through the real route did not appear in it - which is how an image attached to a live ticket
   * could still be deleted through the draft endpoint.
   *
   * Cost: `FeedbackTicket.screenshots` has no GIN index, so this is a sequential scan on every draft
   * delete. Acceptable at the ticket table's size; if it grows, the fix is
   * `CREATE INDEX ... USING GIN ("screenshots")` in a new migration, not a return to reading the
   * column into this process.
   */
  async isScreenshotReferencedByAnyTicket(assetId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<Array<{ found: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "FeedbackTicket"
        WHERE "screenshots" @> ${JSON.stringify([assetId])}::jsonb
      ) AS found
    `;
    return row?.found === true;
  }

  /** The caller's own tickets, newest first. */
  async listTicketsForUser(userId: string) {
    return this.prisma.feedbackTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }

  // ------------------------------------------------------------------
  // FeedbackTicket — operator reads and writes
  // ------------------------------------------------------------------

  /**
   * Every ticket, newest first, for the operator console.
   *
   * The console used to filter the in-memory array. That array only ever held tickets this process
   * had written through the legacy flush, so a ticket created by the C-end route - the only route
   * the app uses - was invisible to the operator who had to answer it. Reading the table is the
   * only complete view, and it is also the only one that survives a restart.
   *
   * `q` keeps the old semantics: a case-insensitive substring over the id, content, source page and
   * category id. The table is small, so the substring runs in this process after the indexed
   * status filter rather than as a `contains` on four columns.
   */
  async listTicketsForAdmin(filter: { q?: string; status?: string } = {}) {
    const status = filter.status && filter.status !== 'all' ? (filter.status as FeedbackStatus) : undefined;
    const rows = await this.prisma.feedbackTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
    const needle = filter.q?.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((ticket) =>
      [ticket.id, ticket.content, ticket.sourcePage, ticket.categoryId].some((value) =>
        String(value).toLowerCase().includes(needle),
      ),
    );
  }

  async findTicketForAdmin(id: string) {
    const row = await this.prisma.feedbackTicket.findUnique({ where: { id }, include: { category: true } });
    if (!row) throw new NotFoundException('反馈工单不存在');
    return row;
  }

  /**
   * Record the operator's reply and move an untouched ticket to `processing`.
   *
   * Row lock (`FOR UPDATE`) inside the transaction prevents concurrent reply/close operations from
   * overwriting each other, and the AuditLog row is written in the same transaction so the audit
   * trail is atomic with the state change.
   */
  async replyToTicketAsAdmin(id: string, value: unknown, adminId: string) {
    const reply = typeof value === 'string' ? value.trim() : '';
    if (!reply) throw new BadRequestException('回复内容不能为空');
    if (reply.length > 1000) throw new BadRequestException('回复内容不能超过 1000 字');

    return await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FeedbackTicket" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('反馈工单不存在');
      const before = await tx.feedbackTicket.findUnique({ where: { id }, include: { category: true } });
      if (!before) throw new NotFoundException('反馈工单不存在');
      if (before.status === 'closed') throw new BadRequestException('已关闭的工单不能再回复');
      const after = await tx.feedbackTicket.update({
        where: { id },
        data: {
          reply,
          repliedBy: adminId,
          repliedAt: new Date(),
          // A reply is work in progress, not proof that the issue has been solved.
          status: before.status === 'open' ? 'processing' : before.status,
        },
        include: { category: true },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: adminId,
          action: 'FEEDBACK_REPLY',
          resourceType: 'FeedbackTicket',
          resourceId: id,
          beforeJson: JSON.parse(JSON.stringify(before)),
          afterJson: JSON.parse(JSON.stringify(after)),
          ip: '127.0.0.1',
          userAgent: 'local-dev',
        },
      });
      return { before, after };
    });
  }

  /**
   * Apply the console's status transition to the row.
   *
   * Row lock (`FOR UPDATE`) inside the transaction prevents concurrent writes, and the AuditLog row
   * is written in the same transaction when changed.
   */
  async updateTicketStatusAsAdmin(id: string, value: unknown, adminId: string) {
    const status = typeof value === 'string' ? value : '';
    const allowed: FeedbackStatus[] = ['open', 'processing', 'resolved', 'closed'];
    if (!allowed.includes(status as FeedbackStatus)) throw new BadRequestException('反馈工单状态不合法');
    const nextStatus = status as FeedbackStatus;

    return await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FeedbackTicket" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('反馈工单不存在');
      const before = await tx.feedbackTicket.findUnique({ where: { id }, include: { category: true } });
      if (!before) throw new NotFoundException('反馈工单不存在');
      if (before.status === nextStatus) return { before, after: before, changed: false };

      const transitions: Record<FeedbackStatus, FeedbackStatus[]> = {
        open: ['processing', 'closed'],
        processing: ['resolved', 'closed'],
        resolved: ['processing', 'closed'],
        closed: [],
      };
      if (!transitions[before.status].includes(nextStatus)) {
        throw new BadRequestException('当前工单不能切换到该状态');
      }
      if (nextStatus === 'resolved' && !before.reply?.trim()) {
        throw new BadRequestException('请先回复用户，再将工单标记为已解决');
      }

      const after = await tx.feedbackTicket.update({
        where: { id },
        data: { status: nextStatus },
        include: { category: true },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: adminId,
          action: 'FEEDBACK_STATUS',
          resourceType: 'FeedbackTicket',
          resourceId: id,
          beforeJson: JSON.parse(JSON.stringify(before)),
          afterJson: JSON.parse(JSON.stringify(after)),
          ip: '127.0.0.1',
          userAgent: 'local-dev',
        },
      });
      return { before, after, changed: true };
    });
  }
}
