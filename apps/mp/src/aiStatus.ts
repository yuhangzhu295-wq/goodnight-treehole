/**
 * The product degrades to a safe template whenever the remote model is unreachable
 * (no balance, bad key, timeout). That degradation is legitimate - a blank screen in a
 * crisis is worse - but it must not be presented as a normal model answer, or the user
 * is told the AI replied when it never did (ISSUE-007).
 *
 * Every AI result surface in the mp app funnels through this classifier so the notice is
 * identical everywhere and is driven by the job's real terminal status, not by guesswork.
 */

export type AiTaskState = {
  status?: string;
  job?: { errorMessage?: string; providerId?: string; fallbackUsed?: boolean } | null;
};

const AI_FALLBACK_NOTICE = '当前模型暂时不可用，下面是一段安全兜底内容，不是模型实时生成的回信。';
const AI_FAILED_NOTICE = '这次生成没有完成，你可以根据自己原来的话改一处再继续。';

export function isAiDegraded(state?: AiTaskState | null): boolean {
  if (!state) return false;
  return state.status === 'fallback' || state.job?.fallbackUsed === true;
}

/** Returns '' when the result came from the model, otherwise the notice to show the user. */
export function aiDegradationNotice(state?: AiTaskState | null): string {
  if (!state) return '';
  if (isAiDegraded(state)) return AI_FALLBACK_NOTICE;
  if (state.status === 'failed') return AI_FAILED_NOTICE;
  return '';
}
