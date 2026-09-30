import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the 晚安树洞 mobile shell.
 *
 * appId, appName, webDir and every plugin block below were recovered from the
 * `assets/capacitor.config.json` embedded in the debug APK the deleted workspace left
 * behind (see docs/disaster-recovery-inventory.md), so they are the values the native
 * build actually shipped with rather than a reconstruction from memory.
 *
 * One value is deliberately changed: SplashScreen.launchAutoHide was false in the
 * recovered config, but nothing in the web app ever calls SplashScreen.hide() - the
 * front end contains no Capacitor imports at all - so with false the app would sit on
 * the splash screen forever. It is true here so the native splash dismisses itself.
 */
const config: CapacitorConfig = {
  appId: 'com.goodnight.treehole',
  appName: '晚安树洞',
  webDir: 'dist',
  backgroundColor: '#fbf8ef',
  plugins: {
    App: {
      // false, not the recovered true. @capacitor/app registers an OnBackPressedCallback
      // with enabled = !disableBackButtonHandler, so true disables it entirely: Capacitor
      // then never handles BACK, the activity falls through to the default behaviour and
      // the app exits from any page, even one the user navigated into. Measured on the
      // emulator: Me -> Privacy (a real in-app navigation), then BACK, exited the app.
      // With false the callback is active and BACK walks the WebView history first, only
      // leaving the app at a root route. See docs/post-recovery-android-findings.md.
      disableBackButtonHandler: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
      style: 'LIGHT',
      autoBackdropColor: 'dom',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchFadeOutDuration: 180,
      backgroundColor: '#fbf8ef',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#fbf8ef',
    },
  },
};

export default config;
