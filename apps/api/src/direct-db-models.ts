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
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
}
