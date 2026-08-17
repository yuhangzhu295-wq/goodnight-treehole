<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type PeerExperience = { id: string; title: string; domain: string; subDomain?: string; stage: string; tags: string[]; createdAt: string; graduated: boolean; laterRecordCount: number; helpfulCount: number; reportCount: number };
type PeerMatch = { id: string; peerExperienceId: string; score: number; explanation?: string; reasons: string[]; status: string; experience?: PeerExperience };
type PeerNetwork = { matches: PeerMatch[]; experiences: PeerExperience[]; limited: boolean };

const router = useRouter();
const item = ref<PeerNetwork | null>(null);
const loading = ref(true);
const error = ref('');
const enabling = ref(false);

async function load() {
  loading.value = true;
  try {
    item.value = (await api.get<{ item: PeerNetwork }>('/api/v1/peers')).item;
    error.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '同路经历加载失败';
  } finally {
    loading.value = false;
  }
}

async function enable() {
  enabling.value = true;
  error.value = '';
  try {
    await api.patch('/api/v1/me/privacy', { allowPeerMatching: true, allowAnonymousExperienceStats: true });
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '隐私设置更新失败';
  } finally {
    enabling.value = false;
  }
}

function openExperience(match: { peerExperienceId?: string; id: string; status?: string }) {
  if (match.status === 'connected' && match.id) {
    router.push(`/pages/peer/conversation?matchId=${encodeURIComponent(match.id)}`);
    return;
  }
  const query = match.id ? `&matchId=${encodeURIComponent(match.id)}` : '';
  router.push(`/pages/peer/detail?id=${encodeURIComponent(match.peerExperienceId ?? match.id)}${query}`);
}

function ago(createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return '时间未知';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  return days < 1 ? '今天留下' : days < 30 ? `${days} 天前留下` : `${Math.floor(days / 30)} 个月前留下`;
}

async function requestConversation(match: PeerMatch) {
  if (match.status !== 'suggested') return openExperience(match);
  try {
    await api.patch(`/api/v1/peer-matches/${encodeURIComponent(match.id)}`, { status: 'requested' });
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '同路请求没有送出';
  }
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page modern-page peers-page">
    <header class="modern-hero compact">
      <div class="status-row"><span>同路经历</span><span>匿名</span></div>
      <h1>有人也走过相似的路</h1>
      <p>只分享已经同意公开的经历，不交换真实身份。</p>
    </header>
    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="loading" class="soft-note">正在查看同路经历...</p>
    <template v-else>
      <section v-if="!item" class="modern-card">
        <h2>先决定分享边界</h2>
        <p>同路网络需要你的明确同意。你可以随时关闭，已保存的匹配记录仍可单独删除。</p>
        <button class="primary-button" :disabled="enabling" @click="enable">{{ enabling ? '正在更新...' : '打开同路经历网络' }}</button>
      </section>
      <template v-else>
        <section class="modern-card">
          <div class="card-heading">
            <div><span class="section-kicker">我的匹配</span><h2>{{ item.matches.length }} 条同路建议</h2></div>
            <div class="header-actions"><button class="text-button" @click="router.push('/pages/peer/requests')">同路请求</button><button class="text-button" @click="router.push('/pages/tonight/index')">回到今晚</button></div>
          </div>
          <article v-for="match in item.matches" :key="match.id" class="peer-row">
            <div class="peer-copy"><div class="peer-title"><strong>{{ match.experience?.title }}</strong><span>{{ match.experience?.graduated ? '已走出这一段' : match.experience?.stage }}</span></div><p>{{ match.explanation || match.reasons.join(' · ') }}</p><small>TA当时：{{ match.experience?.domain }}{{ match.experience?.subDomain ? ` · ${match.experience.subDomain}` : '' }} · {{ ago(match.experience?.createdAt || '') }}</small><span class="score-note">后来记录 {{ match.experience?.laterRecordCount ?? 0 }} 条 · 帮助信誉 {{ match.experience?.helpfulCount ?? 0 }} · 相似度 {{ Math.round(match.score * 100) }}%</span></div>
            <div class="peer-actions"><button class="outline-button" @click="openExperience(match)">{{ match.status === 'connected' ? '进入会话' : '看看TA后来怎么样' }}</button><button class="outline-button request-button" :disabled="match.status === 'requested'" @click="requestConversation(match)">{{ match.status === 'requested' ? '等待TA决定' : '想问问TA' }}</button></div>
          </article>
          <p v-if="!item.matches.length" class="empty-note">还没有匹配。建立一段旅程并打开匹配后，这里会按领域、情境和阶段寻找同路经历。</p>
        </section>
        <section class="modern-card">
          <div class="card-heading"><h2>可公开的经历</h2><span class="count-badge">{{ item.experiences.length }}</span></div>
          <p v-if="!item.experiences.length" class="empty-note">目前没有可公开的同路经历。你可以在旅程完成后，选择是否匿名分享。</p>
          <article v-for="experience in item.experiences" :key="experience.id" class="experience-row">
            <div><strong>{{ experience.title }}</strong><span>{{ experience.domain }} · {{ experience.graduated ? '已走出这一段' : experience.stage }} · {{ ago(experience.createdAt) }}</span></div>
            <button class="outline-button" @click="openExperience(experience)">查看</button>
          </article>
          <p v-if="item.limited" class="feed-limit">今晚先看到这里。稍后再回来看看新的同路经历。</p>
        </section>
      </template>
    </template>
  </section>
</template>

<style scoped>
.header-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.modern-page{display:grid;gap:16px;padding:0 14px 150px}.modern-hero{position:relative;min-height:214px;padding:28px 12px 24px;overflow:hidden;border-radius:0 0 34px 34px;background:linear-gradient(135deg,#f8f4e9,#e9f0df)}.modern-hero.compact{min-height:184px}.modern-hero::after{position:absolute;right:-14px;bottom:-18px;width:190px;height:190px;background:url('../assets/goodnight/tree-top-cutout.png') center/cover no-repeat;opacity:.35;content:'';pointer-events:none}.modern-hero .status-row{position:relative;z-index:1;display:flex;justify-content:space-between;font-weight:700}.section-kicker{color:var(--gn-green);font-size:12px;letter-spacing:.06em}.modern-hero h1{position:relative;z-index:1;max-width:300px;margin:34px 0 8px;color:var(--gn-green-dark);font-family:var(--gn-font-display);font-size:32px;line-height:1.28}.modern-hero p:last-child{position:relative;z-index:1;margin:0;color:var(--gn-subtext)}.modern-card{border:1px solid var(--gn-border);border-radius:var(--gn-radius-card);background:var(--gn-card);box-shadow:var(--gn-shadow-card);padding:22px}.modern-card h2{margin:6px 0 8px;color:var(--gn-text);font-size:21px}.modern-card p{color:var(--gn-subtext);line-height:1.7}.card-heading{display:flex;justify-content:space-between;align-items:start;gap:10px}.text-button,.outline-button{border:0;background:transparent;color:var(--gn-green);font:inherit;cursor:pointer}.count-badge{min-width:24px;padding:4px 8px;border-radius:99px;background:var(--gn-green-light);color:var(--gn-green-dark);text-align:center}.peer-row,.experience-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-bottom:1px solid var(--gn-border)}.peer-copy{min-width:0}.peer-title{display:flex;align-items:center;gap:8px}.peer-title strong{color:var(--gn-text)}.peer-title span{padding:3px 7px;border-radius:999px;background:var(--gn-green-light);color:var(--gn-green-dark);font-size:11px;white-space:nowrap}.peer-row p{margin:6px 0 0;color:var(--gn-subtext);font-size:13px;line-height:1.55}.peer-row small{display:block;margin-top:6px;color:var(--gn-subtext);line-height:1.55}.score-note{display:block;margin-top:7px;color:var(--gn-green);font-size:12px}.peer-actions{display:grid;flex:0 0 auto;gap:7px}.outline-button{padding:8px 10px;border:1px solid var(--gn-border);border-radius:14px;white-space:nowrap;font-size:12px}.request-button:disabled{opacity:.55;cursor:default}.experience-row span{display:block;margin-top:4px;color:var(--gn-subtext);font-size:13px}.feed-limit{margin:14px 0 0;padding:10px 0 0;border-top:1px dashed var(--gn-border);color:var(--gn-subtext);font-size:13px;text-align:center}.empty-note{margin-bottom:0}.primary-button{width:100%;margin-top:12px;border:0;border-radius:16px;padding:13px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.error-text{margin:0 4px;color:var(--gn-danger)}
</style>
