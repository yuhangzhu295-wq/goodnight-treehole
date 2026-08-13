export type Emotion = '委屈' | '焦虑' | '失眠' | '恋爱' | '工作';
export type Visibility = 'PRIVATE' | 'PUBLIC';
export type ReviewStatus = 'pending_review' | 'published' | 'hidden' | 'rejected';
export type ReplyStatus = 'pending_review' | 'published' | 'blocked';
export type ReplyType = 'USER' | 'AI';
export type AIStyle = 'warm' | 'rational' | 'light' | 'clear' | 'poetic';
export type AIJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'fallback' | 'cancelled';

export interface UserProfile {
  id: string;
  nickname: string;
  anonymousCode: string;
  avatarUrl: string;
  status: 'normal' | 'limited' | 'banned';
  createdAt?: string;
}

export interface PostItem {
  id: string;
  moodId: string;
  userId: string;
  emotion: Emotion;
  content: string;
  visibility: Visibility;
  status: 'active' | 'deleted';
  reviewStatus: ReviewStatus;
  hugCount: number;
  replyCount: number;
  favoriteCount: number;
  reportCount: number;
  attachmentIds?: string[];
  attachments?: MediaAsset[];
  createdAt: string;
  publishedAt?: string;
}

export interface MediaAsset {
  id: string;
  userId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  usageType: string;
  status: 'ready' | 'deleted';
  createdAt: string;
}

export interface ReplyItem {
  id: string;
  postId: string;
  userId?: string;
  type: ReplyType;
  style: AIStyle | 'human';
  content: string;
  status: ReplyStatus;
  riskLevel: 'low' | 'medium' | 'high';
  likeCount?: number;
  createdAt: string;
}

export interface PrivacySetting {
  defaultVisibility: Visibility;
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud' | 'template';
  baseUrl: string;
  modelName: string;
  apiKeyStatus: 'configured' | 'missing' | 'valid' | 'invalid';
  enabled: boolean;
  priority: number;
  dailyLimit: number;
  timeoutSeconds: number;
  failoverEnabled: boolean;
  usageTags: string[];
  failureRate: number;
  avgLatencyMs: number;
  todayCalls: number;
  providerKind?: 'ollama' | 'openai-compatible' | 'template' | 'other';
  modelMeta?: {
    size?: number;
    family?: string;
    parameterSize?: string;
    quantization?: string;
    capabilities?: string[];
    digest?: string;
    discoveredAt?: string;
  };
}

export interface AIStyleRoute {
  style: AIStyle;
  label: string;
  taskTypes?: string[];
  primaryProviderId: string;
  backupProviderId: string;
  fallbackTemplateId: string;
  promptVersion: string;
  promptTemplate: string;
  enabled: boolean;
  routeVersion: number;
  timeoutSeconds?: number;
  retryCount?: number;
}

export * from './fingerprint.js';
