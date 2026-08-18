<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import notificationCooldown from '../assets/goodnight/illustrations/notification-cooldown.png';
import notificationFollowup from '../assets/goodnight/illustrations/notification-followup.png';
import notificationLetter from '../assets/goodnight/illustrations/notification-letter.png';
import notificationPeer from '../assets/goodnight/illustrations/notification-peer.png';

type Notice = { id: string; title: string; body: string; type: string; targetRoute?: string; status: 'unread' | 'read' | 'dismissed'; createdAt: string };
const router = useRouter();
const loading = ref(true);
const error = ref('');
const tab = ref<'all' | 'unread'>('all');
const notices = ref<Notice[]>([]);
const visibleNotices = computed(() => tab.value === 'all' ? notices.value : notices.value.filter((item) => item.status === 'unread'));
const illustration = (type: string) => ({ FOLLOW_UP: notificationFollowup, PEER_REQUEST: notificationPeer, PEER_ACCEPTED: notificationPeer, FUTURE_SELF: notificationLetter, COOLDOWN_RELEASED: notificationCooldown, JOURNEY_CHECKIN: notificationFollowup }[type] ?? notificationFollowup);
const time = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

async function load() {
  loading.value = true; error.value = '';
  try { notices.value = (await api.get<{ items: Notice[] }>('/api/v1/notifications')).items; } catch (cause) { error.value = cause instanceof Error ? cause.message : '提醒暂时没有加载出来'; } finally { loading.value = false; }
}
async function open(item: Notice) {
  try { if (item.status === 'unread') await api.patch(`/api/v1/notifications/${item.id}/read`); notices.value = notices.value.map((notice) => notice.id === item.id ? { ...notice, status: 'read' } : notice); if (item.targetRoute) await router.push(item.targetRoute); } catch (cause) { error.value = cause instanceof Error ? cause.message : '提醒状态更新失败'; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page notification-page">
    <header class="notification-hero"><div><p><AppIcon name="tree" :size="18" />晚安树洞</p><h1>提醒与回访</h1><span>那些该回来看看你的时刻，都在这里。</span></div><AppIcon class="hero-moon" name="moon" :size="23" /><AppIcon class="hero-bell" name="bell" :size="22" /></header>
    <div class="notice-tabs" role="tablist"><button :class="{ active: tab === 'all' }" role="tab" @click="tab = 'all'">全部</button><button :class="{ active: tab === 'unread' }" role="tab" @click="tab = 'unread'">未读 <small v-if="notices.some((item) => item.status === 'unread')">{{ notices.filter((item) => item.status === 'unread').length }}</small></button></div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-else-if="loading" class="loading-note">正在读取提醒…</p>
    <section v-else class="notice-list"><button v-for="item in visibleNotices" :key="item.id" class="notice-card" :class="{ unread: item.status === 'unread' }" :data-testid="`notification-${item.id}`" @click="open(item)"><span class="notice-copy"><strong>{{ item.title }}</strong><small>{{ item.body }}</small><time>{{ time(item.createdAt) }}</time></span><span class="notice-art" aria-hidden="true"><img :src="illustration(item.type)" alt="" /></span><i v-if="item.status === 'unread'" aria-label="未读" /><AppIcon name="arrow" :size="19" /></button><p v-if="!visibleNotices.length" class="empty-note">这里暂时没有需要你回应的提醒。</p></section>
  </section>
</template>

<style scoped>
.notification-page{display:grid;gap:16px;padding:0 14px 142px;background:#f4efe4}.notification-hero{position:relative;min-height:184px;margin:0 -14px;overflow:hidden;padding:20px;background:radial-gradient(circle at 72% 65%,rgba(230,168,119,.46),transparent 24%),linear-gradient(164deg,#112030,#273b49 55%,#74655b)}.notification-hero::after{position:absolute;right:-7px;bottom:-19px;width:176px;height:176px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;opacity:.36;content:'';filter:brightness(.7);pointer-events:none}.notification-hero div,.notification-hero .hero-bell{position:relative;z-index:1}.notification-hero div{margin-top:2px}.notification-hero p{display:flex;align-items:center;gap:6px;margin:0;color:rgba(255,250,242,.76);font-size:13px}.notification-hero h1{margin:26px 0 6px;color:#fffaf1;font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif;font-size:31px}.notification-hero span{margin:0;color:rgba(255,250,242,.76);font-size:13px}.hero-moon{position:absolute!important;right:62px;top:23px;color:#fff2c9}.hero-bell{position:absolute!important;right:22px;top:22px;color:#fffaf1}.notice-tabs{display:grid;grid-template-columns:1fr 1fr;justify-self:center;overflow:hidden;width:min(250px,100%);border-radius:999px;background:#ebe6d9;padding:3px}.notice-tabs button{min-height:39px;border:0;border-radius:999px;background:transparent;color:#60715b;font:inherit;cursor:pointer}.notice-tabs button.active{background:#fffdf8;color:#385537;box-shadow:0 3px 8px rgba(45,55,38,.1)}.notice-tabs small{margin-left:3px;border-radius:999px;background:#dfe9d4;padding:2px 5px}.notice-list{display:grid;gap:11px}.notice-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 70px 20px;gap:10px;align-items:center;width:100%;min-height:84px;border:1px solid rgba(95,127,62,.14);border-radius:20px;background:#fffdf8;padding:13px 14px;color:#344a36;text-align:left;box-shadow:0 9px 20px rgba(54,64,46,.08);font:inherit;cursor:pointer}.notice-card.unread{border-color:rgba(86,120,74,.37)}.notice-copy{min-width:0}.notice-copy strong,.notice-copy small,.notice-copy time{display:block}.notice-copy strong{font-size:16px;line-height:1.35}.notice-copy small{margin-top:4px;color:#737c73;line-height:1.42}.notice-copy time{margin-top:7px;color:#90978f;font-size:12px}.notice-art{display:grid;place-items:center;width:70px;height:60px;overflow:hidden}.notice-art img{width:70px;height:60px;object-fit:contain;mix-blend-mode:multiply}.notice-card>svg{color:#677964}.notice-card i{position:absolute;right:37px;top:13px;width:7px;height:7px;border-radius:50%;background:#608156}.error-text{margin:0;color:var(--gn-danger)}.loading-note,.empty-note{margin:0;padding:25px 12px;color:#718070;text-align:center}
</style>
