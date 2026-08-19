export type SupportIntent =
  | 'JUST_LISTEN'
  | 'FIND_PEOPLE'
  | 'SEE_OUTCOMES'
  | 'NEXT_STEP'
  | 'STOP_IMPULSE'
  | 'PREPARE_CONVERSATION'
  | 'NOTHING_NOW'
  | 'HIGH_DISTRESS';

export type SituationDomain = '关系' | '工作' | '家庭' | '金钱' | '学业' | '睡眠' | '孤独' | '其他';

export interface SituationFingerprint {
  domain: string;
  subDomain?: string;
  eventType?: string;
  eventStartedAt?: string;
  daysSinceEvent?: number;
  stage?: string;
  contextTags: string[];
  peopleContext: string[];
  decisionContext: string[];
  behaviorSignals: string[];
  recoverySignals: string[];
  intensity?: number;
  urgency?: number;
  confidence?: 'agent_draft' | 'user_confirmed';
  metadata?: Record<string, unknown>;
}

export interface JourneyOutcome {
  stage?: string;
  intensity?: number;
  lifeFunction?: 'yes' | 'partial' | 'no';
  actionResult?: 'helped' | 'unchanged' | 'worse' | 'unclear';
  decisionChange?: string;
  contactState?: string;
  sleepState?: string;
  socialState?: string;
  selfReportedHelpfulness?: number;
  eventDate?: string;
  barrier?: ActionBarrier;
}

export type ActionBarrier =
  | 'forgot'
  | 'too_hard'
  | 'emotion_too_strong'
  | 'environment'
  | 'something_else'
  | 'did_not_want_to'
  | 'other';

export interface AdaptiveActionResult {
  title: string;
  why: string;
  difficulty: 'tiny' | 'easy' | 'moderate';
  expectedDuration: string;
  completionDefinition: string;
  adaptationReason: ActionBarrier;
}

export interface ActionRecommendation {
  title: string;
  why?: string;
  description?: string;
  difficulty?: 'tiny' | 'easy' | 'moderate';
  expectedDuration?: string;
  completionDefinition?: string;
  dueInDays?: number;
}

export interface PeerMatchScore {
  score: number;
  stageDistance: number;
  recoveryLead: number;
  trustScore: number;
  fingerprintSimilarity: number;
  scoreBreakdown: Record<string, number>;
  explanation: string;
}

export type NotificationType =
  | 'FOLLOW_UP'
  | 'PEER_REQUEST'
  | 'PEER_ACCEPTED'
  | 'CONVERSATION_CLOSED'
  | 'FUTURE_SELF'
  | 'COOLDOWN_RELEASED'
  | 'JOURNEY_CHECKIN';

export type NotificationStatus = 'unread' | 'read' | 'dismissed';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetRoute?: string;
  status: NotificationStatus;
  createdAt: string;
  readAt?: string;
}

export interface PeerConversation {
  id: string;
  matchId: string;
  status: 'active' | 'closed' | 'extended';
  startsAt: string;
  consentAcceptedAt?: string;
  expiresAt: string;
  createdAt: string;
  closedAt?: string;
  closedReason?: 'closed' | 'expired' | 'blocked';
  feedback?: 'helpful' | 'unchanged' | 'uncomfortable';
  feedbackNote?: string;
  reportedAt?: string;
  reporterUserId?: string;
  reportReason?: string;
}

export interface PeerMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  content: string;
  authorType: 'HUMAN' | 'AI_ASSIST';
  createdAt: string;
  reportedAt?: string;
  piiFlags?: string[];
}

export interface RecoverySignal {
  food: 'yes' | 'partial' | 'no';
  outside: 'yes' | 'partial' | 'no';
  humanContact: 'yes' | 'partial' | 'no';
  sleep: 'yes' | 'partial' | 'no';
  mustDo: 'yes' | 'partial' | 'no';
  comfort: 'yes' | 'partial' | 'no';
}
