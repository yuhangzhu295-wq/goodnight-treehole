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
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
}
