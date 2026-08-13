import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { FINGERPRINT } from '@goodnight/shared-types';
(window as any).__FINGERPRINT__ = FINGERPRINT;
(window as any).__GOODNIGHT_FRONT_BUILD__ = {
  scope: 'front-first5',
  frontRest: 'front-rest',
  builtAt: new Date().toISOString(),
  routes: [
    '01-square',
    '02-mood-create',
    '03-post-detail',
    '04-reply-sheet',
    '05-letter-today',
    '06-tool-index',
    '07-tool-decompose',
    '08-me',
    '09-diary-index',
    '10-report-month',
    '11-letter-list',
    '12-favorite-index',
    '13-privacy-settings',
    '14-help-feedback',
  ],
};
import App from './App.vue';
import { router } from './router';
import './styles.scss';

createApp(App).use(createPinia()).use(router).mount('#app');
