export const DIRECT_DB_MODELS = {
  UserNotification: 'notifications',
  SafetyEvent: 'safetyEvents',
  AIJob: 'aiJobs',
  LifeJourney: 'lifeJourneys',
  SituationSnapshot: 'situationSnapshots',
  JourneyUpdate: 'journeyUpdates',
  ActionCommitment: 'actionCommitments',
  OutcomeCheckin: 'outcomeCheckins',
  PeerExperience: 'peerExperiences',
  PeerMatch: 'peerMatches',
  PeerConversation: 'peerConversations',
  PeerMessage: 'peerMessages',
  PeerReport: 'peerReports',
  PrivacySetting: 'privacySettings',
  TrustedContact: 'trustedContacts',
  StableSelfProfile: 'stableSelfProfiles',
  RealityHandoff: 'realityHandoffs',
  PersonalSupportPlan: 'personalSupportPlans',
  MemoryItem: 'memoryItems',
  RecoverySnapshot: 'recoverySnapshots',
  DecisionRecord: 'decisionRecords',
  CooldownItem: 'cooldownItems',
  MessageToFutureSelf: 'messagesToFutureSelf',
  // Batch 4's first conversion. The console's FAQ routes now read and write FaqItem through
  // feedback-persistence.service.ts, so the flush no longer needs to hydrate, upsert or sweep it.
  FaqItem: 'faqs',
  // Batch 4's second conversion: the console's preset routes read and write through
  // feedback-persistence.service.ts, so the flush no longer hydrates, upserts or sweeps them.
  ReplyPreset: 'replyPresets',
  // Batch 4's third conversion, registered together with FeedbackTicket. The two are one unit: the
  // ticket's categoryId FK and both rows' hydration come from the same legacy snapshot, so registering
  // the category alone strands every stored ticket on a row the flush no longer writes. See
  // BATCH4_LEGACY_FLUSH_RETIREMENT.md §2a.
  FeedbackCategory: 'feedbackCategories',
  FeedbackTicket: 'feedbackTickets',
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
}
