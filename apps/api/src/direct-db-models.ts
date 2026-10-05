export const DIRECT_DB_MODELS = {
  UserNotification: 'notifications',
  SafetyEvent: 'safetyEvents',
  AIJob: 'aiJobs',
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
}
