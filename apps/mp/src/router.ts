import { createRouter, createWebHistory } from 'vue-router';

// Page modules used to be eager imports. A normal route refresh therefore
// requested every product view and each view's visual assets. The client could
// exhaust its resource loader during a real click-through, leaving a blank app
// before the requested page mounted. Route-level chunks keep navigation live
// while loading only the page the person actually opened.
const Square = () => import('./views/Square.vue');
const MoodCreate = () => import('./views/MoodCreate.vue');
const PostDetail = () => import('./views/PostDetail.vue');
const LetterToday = () => import('./views/LetterToday.vue');
const ToolIndex = () => import('./views/ToolIndex.vue');
const ToolDecompose = () => import('./views/ToolDecompose.vue');
const ToolRun = () => import('./views/ToolRun.vue');
const Me = () => import('./views/Me.vue');
const DiaryList = () => import('./views/DiaryList.vue');
const DiaryDetail = () => import('./views/DiaryDetail.vue');
const ReportMonth = () => import('./views/ReportMonth.vue');
const LetterList = () => import('./views/LetterList.vue');
const LetterDetail = () => import('./views/LetterDetail.vue');
const Archive = () => import('./views/Archive.vue');
const FavoriteList = () => import('./views/FavoriteList.vue');
const PrivacySettings = () => import('./views/PrivacySettings.vue');
const FeedbackHelp = () => import('./views/FeedbackHelp.vue');
const HelpFaqs = () => import('./views/HelpFaqs.vue');
const DataPolicy = () => import('./views/DataPolicy.vue');
const MeProfile = () => import('./views/MeProfile.vue');
const TonightHome = () => import('./views/TonightHome.vue');
const PeerNetwork = () => import('./views/PeerNetwork.vue');
const ActionCenter = () => import('./views/ActionCenter.vue');
const JourneyDetail = () => import('./views/JourneyDetail.vue');
const PeerExperienceDetail = () => import('./views/PeerExperienceDetail.vue');
const PeerRequests = () => import('./views/PeerRequests.vue');
const PeerConversation = () => import('./views/PeerConversation.vue');
const PeerMatchWaiting = () => import('./views/PeerMatchWaiting.vue');
const PeerConsent = () => import('./views/PeerConsent.vue');
const PeerGraduation = () => import('./views/PeerGraduation.vue');
const RealityHandoff = () => import('./views/RealityHandoff.vue');
const FutureSelf = () => import('./views/FutureSelf.vue');
const Recovery = () => import('./views/Recovery.vue');
const SupportPlan = () => import('./views/SupportPlan.vue');
const StableSelf = () => import('./views/StableSelf.vue');
const MemoryCenter = () => import('./views/MemoryCenter.vue');
const DecisionVault = () => import('./views/DecisionVault.vue');
const SafetySupport = () => import('./views/SafetySupport.vue');
const NotificationCenter = () => import('./views/NotificationCenter.vue');

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
    { path: '/pages/peer/wait', component: PeerMatchWaiting },
    { path: '/pages/peer/consent', component: PeerConsent },
    { path: '/pages/peer/conversation', component: PeerConversation },
    { path: '/pages/peer/graduate', component: PeerGraduation },
    { path: '/pages/reality-handoff/index', component: RealityHandoff },
    { path: '/pages/safety/index', component: SafetySupport },
    { path: '/pages/notifications/index', component: NotificationCenter },
    { path: '/pages/future-self/index', component: FutureSelf },
    { path: '/pages/recovery/index', component: Recovery },
    { path: '/pages/support-plan/index', component: SupportPlan },
    { path: '/pages/stable-self/index', component: StableSelf },
    { path: '/pages/memory/index', component: MemoryCenter },
    { path: '/pages/decision/index', component: DecisionVault },
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
    { path: '/pages/archive/index', component: Archive },
    { path: '/pages/favorite/index', component: FavoriteList },
    { path: '/pages/favorite/list', component: FavoriteList },
    { path: '/pages/settings/privacy', component: PrivacySettings },
    { path: '/pages/settings/data-policy', component: DataPolicy },
    { path: '/pages/help/feedback', component: FeedbackHelp },
    { path: '/pages/help/faqs', component: HelpFaqs },
    { path: '/pages/feedback/index', component: FeedbackHelp },
  ],
});
