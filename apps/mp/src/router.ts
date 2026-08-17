import { createRouter, createWebHistory } from 'vue-router';
import Square from './views/Square.vue';
import MoodCreate from './views/MoodCreate.vue';
import PostDetail from './views/PostDetail.vue';
import LetterToday from './views/LetterToday.vue';
import ToolIndex from './views/ToolIndex.vue';
import ToolDecompose from './views/ToolDecompose.vue';
import ToolRun from './views/ToolRun.vue';
import Me from './views/Me.vue';
import DiaryList from './views/DiaryList.vue';
import DiaryDetail from './views/DiaryDetail.vue';
import ReportMonth from './views/ReportMonth.vue';
import LetterList from './views/LetterList.vue';
import LetterDetail from './views/LetterDetail.vue';
import FavoriteList from './views/FavoriteList.vue';
import PrivacySettings from './views/PrivacySettings.vue';
import FeedbackHelp from './views/FeedbackHelp.vue';
import HelpFaqs from './views/HelpFaqs.vue';
import DataPolicy from './views/DataPolicy.vue';
import MeProfile from './views/MeProfile.vue';
import TonightHome from './views/TonightHome.vue';
import PeerNetwork from './views/PeerNetwork.vue';
import ActionCenter from './views/ActionCenter.vue';
import JourneyDetail from './views/JourneyDetail.vue';
import PeerExperienceDetail from './views/PeerExperienceDetail.vue';
import PeerRequests from './views/PeerRequests.vue';
import PeerConversation from './views/PeerConversation.vue';
import RealityHandoff from './views/RealityHandoff.vue';
import FutureSelf from './views/FutureSelf.vue';
import Recovery from './views/Recovery.vue';
import SafetySupport from './views/SafetySupport.vue';
import NotificationCenter from './views/NotificationCenter.vue';

export const tabRoutes = ['/pages/tonight/index', '/pages/peers/index', '/pages/action/index', '/pages/me/index'];
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/pages/tonight/index' },
    { path: '/pages/tonight/index', component: TonightHome },
    { path: '/pages/peers/index', component: PeerNetwork },
    { path: '/pages/action/index', component: ActionCenter },
    { path: '/pages/journey/detail', component: JourneyDetail },
    { path: '/pages/peer/detail', component: PeerExperienceDetail },
    { path: '/pages/peer/requests', component: PeerRequests },
    { path: '/pages/peer/conversation', component: PeerConversation },
    { path: '/pages/reality-handoff/index', component: RealityHandoff },
    { path: '/pages/safety/index', component: SafetySupport },
    { path: '/pages/notifications/index', component: NotificationCenter },
    { path: '/pages/future-self/index', component: FutureSelf },
    { path: '/pages/recovery/index', component: Recovery },
    { path: '/pages/square/index', component: Square },
    { path: '/pages/mood/create', component: MoodCreate },
    { path: '/pages/post/create', component: MoodCreate },
    { path: '/pages/post/detail', component: PostDetail },
    { path: '/pages/letter/index', component: LetterToday },
    { path: '/pages/letter/today', component: LetterToday },
    { path: '/pages/reply/today', component: LetterToday },
    { path: '/pages/tool/index', component: ToolIndex },
    { path: '/pages/tool/decompose', component: ToolDecompose },
    { path: '/pages/tool/breakdown', component: ToolDecompose },
    { path: '/pages/tool/run', component: ToolRun },
    { path: '/pages/tool/rewrite', component: ToolRun },
    { path: '/pages/tool/rant', component: ToolRun },
    { path: '/pages/tool/heal', component: ToolRun },
    { path: '/pages/tool/sleep', component: ToolRun },
    { path: '/pages/tool/work', component: ToolRun },
    { path: '/pages/tool/future', component: ToolRun },
    { path: '/pages/me/index', component: Me },
    { path: '/pages/me/profile', component: MeProfile },
    { path: '/pages/diary/index', component: DiaryList },
    { path: '/pages/diary/list', component: DiaryList },
    { path: '/pages/me/diaries', component: DiaryList },
    { path: '/pages/diary/detail', component: DiaryDetail },
    { path: '/pages/report/month', component: ReportMonth },
    { path: '/pages/me/month-report', component: ReportMonth },
    { path: '/pages/letter/list', component: LetterList },
    { path: '/pages/letter/detail', component: LetterDetail },
    { path: '/pages/favorite/index', component: FavoriteList },
    { path: '/pages/favorite/list', component: FavoriteList },
    { path: '/pages/settings/privacy', component: PrivacySettings },
    { path: '/pages/settings/data-policy', component: DataPolicy },
    { path: '/pages/help/feedback', component: FeedbackHelp },
    { path: '/pages/help/faqs', component: HelpFaqs },
    { path: '/pages/feedback/index', component: FeedbackHelp },
  ],
});
