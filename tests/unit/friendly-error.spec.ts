import { describe, expect, it } from 'vitest';
import {
  friendlyError,
  NETWORK_FAILURE_MESSAGE,
  UNKNOWN_FAILURE_MESSAGE,
} from '../../apps/mp/src/friendly-error';

/**
 * The conversation page showed the browser's own English "Failed to fetch" in the middle of a
 * Chinese interface when the API was unreachable, because the view renders `cause.message` and the
 * fetch layer let the platform's text through. These cases pin the mapping.
 */
describe('friendlyError', () => {
  it('replaces the Android WebView network text', () => {
    expect(friendlyError(new TypeError('Failed to fetch')).message).toBe(NETWORK_FAILURE_MESSAGE);
  });

  it('replaces the iOS and Capacitor phrasings', () => {
    expect(friendlyError(new TypeError('Load failed')).message).toBe(NETWORK_FAILURE_MESSAGE);
    expect(friendlyError(new Error('Network request failed')).message).toBe(NETWORK_FAILURE_MESSAGE);
    expect(friendlyError(new Error('fetch failed')).message).toBe(NETWORK_FAILURE_MESSAGE);
  });

  it('matches case-insensitively', () => {
    expect(friendlyError(new Error('failed to FETCH')).message).toBe(NETWORK_FAILURE_MESSAGE);
  });

  it('passes an API message through untouched', () => {
    // The API answers with user-facing Chinese; rewriting it would hide the real reason.
    const apiError = new Error('消息内容不能为空');
    expect(friendlyError(apiError).message).toBe('消息内容不能为空');
    expect(friendlyError(apiError)).toBe(apiError);
  });

  it('does not rewrite a message that merely mentions a network word', () => {
    const other = new Error('网络设置里没有打开同路经历网络');
    expect(friendlyError(other).message).toBe('网络设置里没有打开同路经历网络');
  });

  it('replaces a non-Error rejection', () => {
    expect(friendlyError(undefined).message).toBe(UNKNOWN_FAILURE_MESSAGE);
    expect(friendlyError('boom').message).toBe(UNKNOWN_FAILURE_MESSAGE);
  });

  it('does not match an unrelated error', () => {
    const other = new Error('图片上传失败');
    expect(friendlyError(other).message).toBe('图片上传失败');
  });
});
