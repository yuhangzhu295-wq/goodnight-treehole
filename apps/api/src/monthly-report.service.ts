import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { normalizeStoreEmotion, StoreService } from './store.service.js';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

type MonthlyRecord = {
  emotion: string;
  content: string;
  createdAt: string;
  moodId?: string;
};

type DailyPoint = {
  day: number;
  count: number;
  score: number | null;
};

type MonthlyStatistics = {
  month: string;
  recordDays: number;
  totalRecords: number;
  topEmotion: string;
  topEmotionCount: number;
  replyCount: number;
  trend: number[];
  dailyTrend: DailyPoint[];
  emotionDistribution: Record<string, number>;
  keywords: string[];
  keywordCounts: Array<{ keyword: string; count: number }>;
  recovery: MonthlyRecoveryFacts;
};

type LifeFunctionFact = {
  key: 'sleep' | 'humanContact' | 'comfort';
  label: string;
  recordedCount: number;
  yesCount: number;
  partialCount: number;
  noCount: number;
  state: 'unrecorded' | 'returning' | 'adjusting' | 'steady';
};

type MonthlyRecoveryFacts = {
  journeyCount: number;
  completedJourneyCount: number;
  supportIntentCount: number;
  intensityCheckinCount: number;
  intensityChangeCount: number;
  actionCount: number;
  completedActionCount: number;
  adaptedActionCount: number;
  missedActionCount: number;
  recoveryCheckinCount: number;
  peerConversationCount: number;
  peerExperienceCount: number;
  decisionCount: number;
  mostHelpfulAction?: string;
  mostStuckAction?: string;
  lifeFunctions: LifeFunctionFact[];
};

type ReportMetadata = {
  items?: string[];
  sourceSignature?: string;
  summaryJobId?: string;
  summaryStatus?: string;
  topEmotionCount?: number;
  totalRecords?: number;
};

const keywordCandidates = ['工作', '汇报', '睡眠', '失眠', '关系', '委屈', '焦虑', '项目', '家人', '恋爱'];

const emotionScores: Record<string, number> = {
  开心: 4,
  恋爱: 4,
  工作: 3,
  焦虑: 2,
  委屈: 2,
  难过: 2,
  孤独: 2,
  失眠: 1,
  生气: 1,
};

function assertMonth(value?: string) {
  const month = value ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
  return month;
}

function labelForEmotion(value?: string) {
  const normalized = String(normalizeStoreEmotion(value));
  if (normalized === 'jiaolv' || normalized === '??') return '焦虑';
  return normalized || '焦虑';
}

function safeSummary(value?: string | null) {
  return String(value ?? '')
    .replace(/\?\?/g, '')
    .replace(/\bjiaolv\b/gi, '焦虑')
    .trim();
}

function readMetadata(value: unknown): ReportMetadata {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return { items: Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] };
  }
  const raw = value as Record<string, unknown>;
  return {
    items: Array.isArray(raw.items) ? raw.items.filter((item): item is string => typeof item === 'string') : [],
    sourceSignature: typeof raw.sourceSignature === 'string' ? raw.sourceSignature : undefined,
    summaryJobId: typeof raw.summaryJobId === 'string' ? raw.summaryJobId : undefined,
    summaryStatus: typeof raw.summaryStatus === 'string' ? raw.summaryStatus : undefined,
    topEmotionCount: typeof raw.topEmotionCount === 'number' ? raw.topEmotionCount : undefined,
    totalRecords: typeof raw.totalRecords === 'number' ? raw.totalRecords : undefined,
  };
}

function signatureFor(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function terminal(status?: string | null) {
  return ['succeeded', 'failed', 'fallback', 'cancelled'].includes(String(status));
}

function belongsToMonth(month: string, ...values: Array<string | undefined>) {
  return values.some((value) => Boolean(value && value.startsWith(month)));
}

@Injectable()
export class MonthlyReportService {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService,
  ) {}

  private recordsFor(userId: string, month: string): MonthlyRecord[] {
    const diaries = this.store.diaries
      .filter((item) => item.userId === userId && item.createdAt.startsWith(month))
      .map((item) => ({ emotion: item.emotion, content: item.content, createdAt: item.createdAt, moodId: item.moodId }));
    const diaryMoodIds = new Set(diaries.map((item) => item.moodId).filter((item): item is string => Boolean(item)));
    const unlinkedMoods = this.store.moods
      .filter((item) => item.userId === userId && item.status === 'active' && item.createdAt.startsWith(month) && !diaryMoodIds.has(item.id))
      .map((item) => ({ emotion: item.emotion, content: item.content, createdAt: item.createdAt, moodId: item.id }));
    return [...diaries, ...unlinkedMoods];
  }

  private recoveryFactsFor(userId: string, month: string): MonthlyRecoveryFacts {
    const journeys = this.store.lifeJourneys.filter(
      (item) =>
        item.userId === userId &&
        belongsToMonth(month, item.createdAt, item.updatedAt, item.completedAt),
    );
    const actions = this.store.actionCommitments.filter(
      (item) => item.userId === userId && belongsToMonth(month, item.createdAt, item.updatedAt),
    );
    const checkins = this.store.outcomeCheckins.filter(
      (item) => item.userId === userId && belongsToMonth(month, item.createdAt, item.checkedAt, item.dueAt),
    );
    const recoverySnapshots = this.store.recoverySnapshots.filter(
      (item) => item.userId === userId && belongsToMonth(month, item.createdAt),
    );
    const peerConversationCount = this.store.peerConversations.filter(
      (item) =>
        (item.starterUserId === userId || item.receiverUserId === userId) &&
        belongsToMonth(month, item.createdAt, item.startsAt, item.closedAt),
    ).length;
    const peerExperienceCount = this.store.peerExperiences.filter(
      (item) => item.userId === userId && belongsToMonth(month, item.createdAt, item.updatedAt, item.consentedAt),
    ).length;
    const decisionCount = this.store.decisionRecords.filter(
      (item) => item.userId === userId && belongsToMonth(month, item.createdAt, item.updatedAt, item.reviewedAt),
    ).length;
    const journeysById = new Map(journeys.map((item) => [item.id, item]));
    const intensityCheckins = checkins.filter((item) => Number.isFinite(Number(item.intensity)));
    const completedActions = actions
      .filter((item) => item.status === 'completed')
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const stuckAction = actions
      .filter((item) => item.status === 'skipped' || item.status === 'paused')
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    const lifeFunctions = [
      { key: 'sleep', label: '睡眠有被照顾' },
      { key: 'humanContact', label: '和可信任的人有联系' },
      { key: 'comfort', label: '做了一件让自己舒服的事' },
    ].map(({ key, label }) => {
      const values = recoverySnapshots
        .map((item) => String(item.signals?.[key] ?? ''))
        .filter((item) => ['yes', 'partial', 'no'].includes(item));
      const yesCount = values.filter((item) => item === 'yes').length;
      const partialCount = values.filter((item) => item === 'partial').length;
      const noCount = values.filter((item) => item === 'no').length;
      const state = !values.length
        ? 'unrecorded'
        : yesCount > noCount
          ? 'returning'
          : noCount > yesCount
            ? 'adjusting'
            : 'steady';
      return { key, label, recordedCount: values.length, yesCount, partialCount, noCount, state } as LifeFunctionFact;
    });
    return {
      journeyCount: journeys.length,
      completedJourneyCount: journeys.filter((item) => item.status === 'completed').length,
      supportIntentCount: journeys.filter((item) => Boolean(item.currentIntent)).length,
      intensityCheckinCount: intensityCheckins.length,
      intensityChangeCount: intensityCheckins.filter((item) => {
        const initial = journeysById.get(item.journeyId)?.initialIntensity;
        return initial !== undefined && Number(item.intensity) !== initial;
      }).length,
      actionCount: actions.length,
      completedActionCount: completedActions.length,
      adaptedActionCount: actions.filter((item) => Boolean(item.parentActionId || item.adaptationReason)).length,
      missedActionCount: checkins.filter((item) => item.status === 'missed').length,
      recoveryCheckinCount: recoverySnapshots.length,
      peerConversationCount,
      peerExperienceCount,
      decisionCount,
      mostHelpfulAction: completedActions[0]?.title,
      mostStuckAction: stuckAction?.title,
      lifeFunctions,
    };
  }

  private statisticsFor(userId: string, month: string): MonthlyStatistics {
    const records = this.recordsFor(userId, month);
    const distribution = records.reduce<Record<string, number>>((accumulator, item) => {
      const label = labelForEmotion(item.emotion);
      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {});
    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const byDay = new Map<number, MonthlyRecord[]>();
    for (const record of records) {
      const day = Math.max(1, Math.min(daysInMonth, Number(record.createdAt.slice(8, 10)) || 1));
      byDay.set(day, [...(byDay.get(day) ?? []), record]);
    }
    const dailyTrend: DailyPoint[] = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dayRecords = byDay.get(day) ?? [];
      if (!dayRecords.length) return { day, count: 0, score: null };
      const totalScore = dayRecords.reduce((sum, item) => sum + (emotionScores[labelForEmotion(item.emotion)] ?? 2), 0);
      return { day, count: dayRecords.length, score: Math.round((totalScore / dayRecords.length) * 10) / 10 };
    });
    const trend = Array.from({ length: 7 }, (_, index) => {
      const start = Math.floor((index * daysInMonth) / 7) + 1;
      const end = Math.floor(((index + 1) * daysInMonth) / 7);
      return dailyTrend.slice(start - 1, end).reduce((sum, point) => sum + point.count, 0);
    });
    const linkedMoodIds = new Set(records.map((item) => item.moodId).filter((item): item is string => Boolean(item)));
    const relatedPostIds = this.store.posts
      .filter((post) => post.userId === userId && linkedMoodIds.has(post.moodId))
      .map((post) => post.id);
    const replyCount = this.store.replies.filter((reply) => relatedPostIds.includes(reply.postId) && reply.status === 'published').length;
    const joinedContent = records.map((item) => item.content).join('\n');
    const keywordCounts = keywordCandidates
      .map((keyword) => ({ keyword, count: joinedContent.split(keyword).length - 1 }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
    const keywords = keywordCounts.map((item) => item.keyword);
    const topEmotionEntry = Object.entries(distribution).sort((left, right) => right[1] - left[1])[0];
    return {
      month,
      recordDays: byDay.size,
      totalRecords: records.length,
      topEmotion: topEmotionEntry?.[0] ?? '暂无',
      topEmotionCount: topEmotionEntry?.[1] ?? 0,
      replyCount,
      trend,
      dailyTrend,
      emotionDistribution: distribution,
      keywords,
      keywordCounts,
      recovery: this.recoveryFactsFor(userId, month),
    };
  }

  async availableMonths() {
    const userId = this.store.getDemoUserId();
    const months = new Set<string>();
    const addMonths = (...values: Array<string | undefined>) => {
      for (const value of values) if (value && /^\d{4}-\d{2}/.test(value)) months.add(value.slice(0, 7));
    };
    for (const item of this.store.diaries) if (item.userId === userId) addMonths(item.createdAt);
    for (const item of this.store.moods) if (item.userId === userId) addMonths(item.createdAt);
    for (const item of this.store.lifeJourneys)
      if (item.userId === userId) addMonths(item.createdAt, item.updatedAt, item.completedAt, item.intentUpdatedAt);
    for (const item of this.store.actionCommitments)
      if (item.userId === userId) addMonths(item.createdAt, item.updatedAt, item.dueAt, item.reminderAt);
    for (const item of this.store.outcomeCheckins)
      if (item.userId === userId) addMonths(item.createdAt, item.checkedAt, item.dueAt);
    for (const item of this.store.recoverySnapshots) if (item.userId === userId) addMonths(item.createdAt);
    for (const item of this.store.decisionRecords)
      if (item.userId === userId) addMonths(item.createdAt, item.updatedAt, item.reviewedAt);
    for (const item of this.store.peerExperiences)
      if (item.userId === userId) addMonths(item.createdAt, item.updatedAt, item.consentedAt);
    for (const item of this.store.peerConversations)
      if (item.starterUserId === userId || item.receiverUserId === userId)
        addMonths(item.createdAt, item.startsAt, item.closedAt);
    months.add(new Date().toISOString().slice(0, 7));
    return { items: [...months].sort((left, right) => right.localeCompare(left)) };
  }

  async monthly(value?: string) {
    const month = assertMonth(value);
    const userId = this.store.getDemoUserId();
    const statistics = this.statisticsFor(userId, month);
    const analysisAllowed = this.store.privacySettings[userId]?.allowJourneyLongTermAnalysis === true;
    const sourceSignature = signatureFor({ userId, ...statistics });
    let report = await this.prisma.monthlyReport.findUnique({ where: { userId_month: { userId, month } } });
    let metadata = report ? readMetadata(report.keywordsJson) : {};

    if (!report || metadata.sourceSignature !== sourceSignature || (analysisAllowed && !metadata.summaryJobId)) {
      if (report) await this.prisma.reportAdvice.deleteMany({ where: { reportId: report.id } });
      const job = analysisAllowed
        ? this.store.queueAI({
            taskType: 'monthly_recovery_summary',
            content: JSON.stringify(statistics),
            style: 'rational',
            userId,
            sourceId: `monthly_report_${userId}_${month}_${sourceSignature}`,
          })
        : undefined;
      if (job) await this.store.flush();
      metadata = {
        items: statistics.keywords,
        sourceSignature,
        summaryJobId: job?.id,
        summaryStatus: job?.status ?? 'disabled',
        topEmotionCount: statistics.topEmotionCount,
        totalRecords: statistics.totalRecords,
      };
      report = await this.prisma.monthlyReport.upsert({
        where: { userId_month: { userId, month } },
        create: {
          userId,
          month,
          recordDays: statistics.recordDays,
          topEmotion: statistics.topEmotion,
          replyCount: statistics.replyCount,
          trendJson: { values: statistics.trend, daily: statistics.dailyTrend },
          distributionJson: statistics.emotionDistribution,
          keywordsJson: metadata,
          summary: '',
        },
        update: {
          recordDays: statistics.recordDays,
          topEmotion: statistics.topEmotion,
          replyCount: statistics.replyCount,
          trendJson: { values: statistics.trend, daily: statistics.dailyTrend },
          distributionJson: statistics.emotionDistribution,
          keywordsJson: metadata,
          summary: analysisAllowed ? '' : report?.summary ?? '',
        },
      });
    }

    if (!report) throw new BadRequestException('无法创建月报快照');

    const persistedJob = analysisAllowed && metadata.summaryJobId ? await this.prisma.aIJob.findUnique({ where: { id: metadata.summaryJobId } }) : undefined;
    const job = persistedJob ?? this.store.aiJobs.find((item) => item.id === metadata.summaryJobId);
    if (analysisAllowed && job && terminal(job.status)) {
      const nextSummary = ['succeeded', 'fallback'].includes(job.status) ? safeSummary(job.result) : '';
      metadata = { ...metadata, summaryStatus: job.status };
      if (report.summary !== nextSummary || readMetadata(report.keywordsJson).summaryStatus !== job.status) {
        report = await this.prisma.monthlyReport.update({ where: { id: report.id }, data: { summary: nextSummary, keywordsJson: metadata } });
      }
    }

    const trendJson = report.trendJson as { values?: unknown; daily?: unknown } | null;
    const storedTrend = Array.isArray(trendJson?.values) ? trendJson.values.map(Number) : statistics.trend;
    const storedDaily = Array.isArray(trendJson?.daily) ? trendJson.daily as DailyPoint[] : statistics.dailyTrend;
    const storedDistribution = report.distributionJson && typeof report.distributionJson === 'object' && !Array.isArray(report.distributionJson)
      ? report.distributionJson as unknown as Record<string, number>
      : statistics.emotionDistribution;
    return {
      item: {
        ...statistics,
        recordDays: report.recordDays,
        topEmotion: report.topEmotion,
        replyCount: report.replyCount,
        topEmotionCount: metadata.topEmotionCount ?? statistics.topEmotionCount,
        totalRecords: metadata.totalRecords ?? statistics.totalRecords,
        trend: storedTrend,
        dailyTrend: storedDaily,
        emotionDistribution: storedDistribution,
        keywords: metadata.items ?? statistics.keywords,
        summary: analysisAllowed ? safeSummary(report.summary) : '',
        aiJobId: metadata.summaryJobId,
        aiJobStatus: analysisAllowed ? job?.status ?? metadata.summaryStatus ?? 'queued' : 'disabled',
        analysisAllowed,
      },
    };
  }

  async advice(value: string) {
    const monthly = await this.monthly(value);
    const userId = this.store.getDemoUserId();
    if (!monthly.item.analysisAllowed)
      return { item: { month: monthly.item.month, content: '', aiJobStatus: 'disabled', analysisAllowed: false } };
    const report = await this.prisma.monthlyReport.findUniqueOrThrow({ where: { userId_month: { userId, month: monthly.item.month } } });
    const metadata = readMetadata(report.keywordsJson);
    const sourceSignature = metadata.sourceSignature ?? signatureFor(monthly.item);
    const contentId = `monthly_advice_${userId}_${report.id}_${sourceSignature}`;
    let job: any = await this.prisma.aIJob.findFirst({ where: { contentId }, orderBy: { createdAt: 'desc' } });
    job ??= this.store.aiJobs.find((item) => item.contentId === contentId);
    let advice = await this.prisma.reportAdvice.findFirst({ where: { reportId: report.id }, orderBy: { createdAt: 'desc' } });
    if (!job && !advice) {
      const queued = this.store.queueAI({
        taskType: 'monthly_recovery_summary',
        content: `基于以下真实月报统计给出三条温和、可执行的建议，不要改写或虚构数字：${JSON.stringify(monthly.item)}`,
        style: 'rational',
        userId,
        sourceId: contentId,
      });
      await this.store.flush();
      job = await this.prisma.aIJob.findUnique({ where: { id: queued.id } }) ?? this.store.aiJobs.find((item) => item.id === queued.id);
    }
    if (job?.id) job = (await this.prisma.aIJob.findUnique({ where: { id: job.id } })) ?? this.store.aiJobs.find((item) => item.id === job.id) ?? job;
    if (job && terminal(job.status) && ['succeeded', 'fallback'].includes(job.status) && !advice) {
      advice = await this.prisma.reportAdvice.create({ data: { reportId: report.id, content: safeSummary(job.result) } });
    }
    return {
      item: {
        month: monthly.item.month,
        content: safeSummary(advice?.content),
        aiJobId: job?.id,
        aiJobStatus: job?.status ?? (advice ? 'succeeded' : 'queued'),
      },
    };
  }

  async poster(value: string) {
    const userId = this.store.getDemoUserId();
    if (!this.store.privacySettings[userId]?.allowMonthlyReportShare) throw new ForbiddenException('当前隐私设置未允许生成月报分享图');
    const monthly = await this.monthly(value);
    if (!monthly.item.summary || !['succeeded', 'fallback'].includes(String(monthly.item.aiJobStatus))) {
      throw new BadRequestException('月报总结仍在生成，请完成后再生成分享图');
    }
    const asset = await this.store.createMonthlyReportPoster(userId, monthly.item.month, monthly.item.summary);
    return { posterUrl: asset.url, asset, permission: 'download-ready' };
  }
}
