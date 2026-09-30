import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Hardware back button adapter for the native shell.
 *
 * The web app is a plain SPA with no other Capacitor code, and vue-router uses
 * createWebHistory, so the WebView's history already behaves correctly - calling
 * `window.history.back()` from the page walks it properly (verified on the emulator).
 * What did not work was the hardware button:
 *
 *   App.disableBackButtonHandler: true   -> Capacitor's OnBackPressedCallback is registered
 *                                           with enabled = !true, so it is disabled and the
 *                                           activity falls through to the platform default,
 *                                           finishing the app from any inner page.
 *   App.disableBackButtonHandler: false  -> the callback runs, but with no `backButton`
 *                                           listener registered it only fires an event into
 *                                           the void, so BACK did nothing at all.
 *
 * Registering this listener takes the first branch Capacitor documents for a back press.
 *
 * One correction to the documented snippet: it gates on the `canGoBack` that Capacitor
 * passes, which comes from `WebView.canGoBack()`. On this app that returns false even when
 * the SPA has three history entries, because the in-app navigations are `history.pushState`
 * calls and the WebView's own back/forward list does not count them. Trusting it made BACK
 * exit the app from an inner page. The page's own `window.history.length` is the reliable
 * signal here - `window.history.back()` was verified to walk tonight -> me -> privacy and
 * back correctly on the emulator - so that is what decides whether to go back or leave.
 */
if (Capacitor.isNativePlatform()) {
  void App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });
}
