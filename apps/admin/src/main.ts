import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { FINGERPRINT } from '@goodnight/shared-types';
(window as any).__FINGERPRINT__ = FINGERPRINT;
import TDesign from 'tdesign-vue-next';
import 'tdesign-vue-next/es/style/index.css';
import App from './App.vue';
import { router } from './router';
import './styles.scss';

createApp(App).use(createPinia()).use(TDesign).use(router).mount('#app');
