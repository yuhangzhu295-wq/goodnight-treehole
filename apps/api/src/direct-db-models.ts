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
  // Batch 4 model 5 of 16. The console's note routes read and write through
  // admin-notes-persistence.service.ts; the users list fetches the page's current notes in one query
  // rather than one per row. Its sweep was previously unguarded, so this registration is also what
  // stops the absence sweep from removing a directly written note.
  AdminUserNote: 'adminUserNotes',
  // Batch 4 model 6 of 16. Registering it removes the sweep; note that the model is currently inert -
  // nothing in the product writes a reputation row, so the matching trust term is a constant. The
  // finding is recorded in BATCH4_LEGACY_FLUSH_RETIREMENT.md §5b and is deliberately not "fixed" here,
  // because whether peer reputation should exist is a product decision.
  PeerReputation: 'peerReputations',
  // Batch 4 model 7 of 16. The writer and both readers moved to Batch1PersistenceService: recording
  // an AI decision now writes the row directly, the archive-cleanup path deletes the logs for its
  // journeys, and the export path detaches them. Its ids also fed two FK allowlists in the mapper, and
  // those contributions are dropped the same way every other registered model's are.
  AgentDecisionLog: 'agentDecisionLogs',
  // Batch 4 model 8 of 16, and the first member of the Post cluster. It is not a leaf: the same
  // rows own `Post.favoriteCount` and `Letter.favorite`, and the feed's `favoritedByCurrentUser`
  // flag reads them through the per-request decoration context. Those three projections are kept
  // by favorite-persistence.service.ts; see BATCH4_LEGACY_FLUSH_RETIREMENT.md §5d.
  Favorite: 'favorites',
  // Batch 4 model 9 of 16, second member of the Post cluster. Its coupling is Post.replyCount;
  // reply-persistence.service.ts derives that counter from the table after every publish and at boot.
  Reply: 'replies',
  // Batch 4 model 10 of 16, the hub of the cluster. With it registered the flush no longer
  // hydrates, upserts or sweeps Post; post-persistence.service.ts owns the row, the two
  // denormalised counters and the reads, and the reply/favourite paths write those counters.
  Post: 'posts',
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
}
