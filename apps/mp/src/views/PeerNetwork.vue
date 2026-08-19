<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type PeerExperience = { id: string; title: string; domain: string; subDomain?: string; stage: string; tags: string[]; createdAt: string; graduated: boolean; laterRecordCount: number };
type PeerMatch = { id: string; journeyId: string; status: string; reasons: string[]; experience?: PeerExperience };
type PeerNetwork = { privacyEnabled: boolean; matches: PeerMatch[]; experiences: PeerExperience[]; limited: boolean };

const router = useRouter();
const item = ref<PeerNetwork | null>(null);
const loading = ref(true);
const error = ref('');
const enabling = ref(false);

async function load() {
  loading.value = true;
  try { item.value = (await api.get<{ item: PeerNetwork }>('/api/v1/peers')).item; error.value = ''; }
  catch (cause: any) { error.value = cause?.message ?? '同路经历加载失败'; }
  finally { loading.value = false; }
}

async function enable() {
  enabling.value = true;
  try { await api.patch('/api/v1/me/privacy', { allowPeerMatching: true, allowAnonymousExperienceStats: true }); await load(); }
  catch (cause: any) { error.value = cause?.message ?? '隐私设置更新失败'; }
  finally { enabling.value = false; }
}

function openExperience(match: PeerMatch) {
  if (match.status === 'requested' || match.status === 'connected') { router.push(`/pages/peer/wait?matchId=${encodeURIComponent(match.id)}`); return; }
  const experienceId = match.experience?.id;
  if (experienceId) router.push(`/pages/peer/detail?id=${encodeURIComponent(experienceId)}&matchId=${encodeURIComponent(match.id)}`);
}

function openPublished(experience: PeerExperience) { router.push(`/pages/peer/detail?id=${encodeURIComponent(experience.id)}`); }
function ago(createdAt: string) { const days = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000)); return days < 1 ? '最近留下' : days < 30 ? `${days} 天前留下` : '较早留下'; }
onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-network-page">
    <header class="peer-hero">
      <div class="hero-top"><span>晚安树洞</span><span class="hero-mark">匿名同路</span></div>
      <h1>有人也走过<br>相似的路</h1>
      <p>看看别人后来怎么走，也把你的边界留在自己手里。</p>
    </header>

    <div class="peer-tabs" role="tablist" aria-label="同路内容"><button class="active" type="button">推荐给你</button><button type="button" @click="router.push('/pages/peer/requests')">我的请求</button></div>
    <p v-if="error" class="error-note" role="alert">{{ error }}</p>
    <p v-if="loading" class="state-note">正在找走过相似路的人…</p>

    <section v-else-if="!item || !item.privacyEnabled" class="boundary-card">
      <span class="leaf-glyph" aria-hidden="true"></span><h2>这里不会自动让别人看到你</h2>
      <p>只有你愿意，系统才会用匿名后的经历，帮你寻找走过相似道路的人。</p>
      <ul><li>会分享：经你确认的匿名经历与后来。</li><li>不会分享：昵称、联系方式、位置或真实身份。</li></ul>
      <button :disabled="enabling" @click="enable">{{ enabling ? '正在确认…' : '允许匿名寻找同路经历' }}</button>
      <button class="privacy-link" type="button" @click="router.push('/pages/privacy/index')">看看隐私边界</button>
    </section>

    <template v-else>
      <section class="recommend-block">
        <div class="section-heading"><div><span>今晚的推荐</span><h2>也许这些后来，能陪你多走一步</h2></div><button type="button" @click="load">刷新</button></div>
        <article v-for="match in item.matches" :key="match.id" class="peer-story-card">
          <div class="story-top"><span class="anonymous-dot" aria-hidden="true"></span><div><strong>{{ match.experience?.title || '一段匿名经历' }}</strong><small>{{ match.experience?.domain }} · {{ ago(match.experience?.createdAt || '') }}</small></div><span class="later-pill">后来</span></div>
          <p class="reason">{{ match.reasons.join(' · ') || '这段经历和你眼前的处境有一些相似。' }}</p>
          <div class="story-footer"><span>{{ match.experience?.laterRecordCount ? `留下了 ${match.experience.laterRecordCount} 段后来` : '留下一点后来' }}</span><button type="button" @click="openExperience(match)">{{ match.status === 'requested' ? '等待回应' : match.status === 'connected' ? '查看进展' : '看看 TA 后来怎么样' }}</button></div>
        </article>
        <p v-if="!item.matches.length" class="empty-note">暂时还没有足够接近的同路经历。你正在走的路会慢慢变得更清楚。</p>
      </section>
      <section class="public-block">
        <div class="section-heading"><div><span>匿名经历</span><h2>已经同意分享的后来</h2></div></div>
        <button v-for="experience in item.experiences" :key="experience.id" type="button" class="public-row" @click="openPublished(experience)"><span class="row-sprout" aria-hidden="true"></span><span><strong>{{ experience.title }}</strong><small>{{ experience.domain }} · {{ experience.graduated ? '已经走过一段' : '仍在慢慢走' }}</small></span><b aria-hidden="true"></b></button>
        <p v-if="item.limited" class="limit-note">今晚先看到这里，明天也会有新的后来。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.peer-network-page{display:grid;gap:16px;padding:0 16px 142px;background:linear-gradient(180deg,#18313a 0 205px,#fbf8ef 205px)}
.peer-hero{position:relative;min-height:194px;margin:0 -16px;padding:22px 26px;overflow:hidden;color:#f7f2df;background:linear-gradient(138deg,#152b33,#29464a 56%,#435d48)}.peer-hero::after{position:absolute;right:-12px;bottom:-22px;width:200px;height:205px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;filter:brightness(.58) saturate(.76);opacity:.8;content:'';pointer-events:none}.hero-top,.peer-hero h1,.peer-hero p{position:relative;z-index:1}.hero-top{display:flex;justify-content:space-between;font-size:12px}.hero-mark{padding:4px 9px;border:1px solid rgba(255,255,255,.32);border-radius:999px}.peer-hero h1{margin:36px 0 8px;max-width:220px;font-family:var(--gn-font-display);font-size:31px;line-height:1.18}.peer-hero p{max-width:270px;margin:0;color:#e1e8d2;font-size:13px;line-height:1.7}.peer-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:-8px;padding:6px;border:1px solid var(--gn-border);border-radius:999px;background:rgba(255,255,255,.91);box-shadow:var(--gn-shadow-card)}.peer-tabs button{min-height:42px;border:0;border-radius:999px;background:transparent;color:var(--gn-subtext);font:inherit;cursor:pointer}.peer-tabs .active{background:var(--gn-green);color:#fff}.state-note,.empty-note{margin:34px 10px;color:var(--gn-subtext);line-height:1.7;text-align:center}.error-note{margin:0;color:var(--gn-danger);text-align:center}.boundary-card,.peer-story-card,.public-block{border:1px solid var(--gn-border);border-radius:24px;background:var(--gn-card);box-shadow:var(--gn-shadow-card)}.boundary-card{padding:24px;text-align:center}.boundary-card h2{margin:8px 0;color:var(--gn-green-dark)}.boundary-card p{margin:0;color:var(--gn-subtext);line-height:1.7}.boundary-card button,.story-footer button{min-height:46px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.boundary-card button{width:100%;margin-top:18px}.leaf-glyph,.row-sprout{color:var(--gn-green);font-size:24px}.recommend-block{display:grid;gap:12px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:2px 4px}.section-heading span{color:var(--gn-green);font-size:12px}.section-heading h2{margin:5px 0 0;color:var(--gn-text);font-size:20px}.section-heading button{border:0;background:transparent;color:var(--gn-green);font:inherit;cursor:pointer}.peer-story-card{padding:18px}.story-top{display:flex;align-items:center;gap:10px}.anonymous-dot{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green)}.story-top div{display:grid;gap:3px;min-width:0}.story-top strong{color:var(--gn-text)}.story-top small,.public-row small{color:var(--gn-subtext);font-size:12px}.later-pill{margin-left:auto;padding:4px 8px;border-radius:999px;background:#f5eed8;color:#806d3f;font-size:11px}.reason{margin:16px 0;color:var(--gn-text);line-height:1.72}.story-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;border-top:1px solid var(--gn-border)}.story-footer span{color:var(--gn-subtext);font-size:12px}.story-footer button{padding:0 14px;font-size:12px}.public-block{display:grid;gap:0;padding:18px}.public-row{display:grid;grid-template-columns:34px minmax(0,1fr)18px;align-items:center;gap:8px;width:100%;padding:15px 0;border:0;border-bottom:1px solid var(--gn-border);background:transparent;text-align:left;cursor:pointer}.public-row:last-of-type{border-bottom:0}.public-row span:nth-child(2){display:grid;gap:4px}.public-row strong{color:var(--gn-text)}.public-row b{color:var(--gn-green);font-size:24px;font-weight:400}.limit-note{margin:14px 0 0;color:var(--gn-subtext);font-size:12px;text-align:center}
.boundary-card ul{display:grid;gap:7px;margin:16px 0 0;padding:0;list-style:none;color:var(--gn-text);font-size:13px;line-height:1.55;text-align:left}.boundary-card li{padding:9px 11px;border-radius:12px;background:#f6f7ef}.boundary-card .privacy-link{min-height:34px;margin-top:4px;background:transparent;color:var(--gn-green-dark);text-decoration:underline}.leaf-glyph,.row-sprout,.anonymous-dot{display:inline-block;position:relative;flex:0 0 auto;color:transparent}.leaf-glyph{width:26px;height:26px;border:1.5px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.leaf-glyph::after{position:absolute;left:50%;top:4px;height:19px;border-left:1px solid var(--gn-green);content:''}.anonymous-dot{width:38px;height:38px;border-radius:50%;background:var(--gn-green-light)}.anonymous-dot::before{position:absolute;inset:11px;border:1.5px solid var(--gn-green);border-radius:50%;content:''}.anonymous-dot::after{position:absolute;left:17px;top:7px;height:25px;border-left:1px solid var(--gn-green);content:'';transform:rotate(38deg)}.row-sprout{width:18px;height:18px;border:1.5px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.row-sprout::after{position:absolute;left:8px;top:2px;height:14px;border-left:1px solid var(--gn-green);content:''}.public-row b{width:8px;height:8px;border-top:1.5px solid var(--gn-green);border-right:1.5px solid var(--gn-green);transform:rotate(45deg)}
.peer-hero::after{right:-2px;bottom:0;width:220px;height:205px;background:url('../assets/goodnight/peer/peer-night-tree.png') right bottom/220px 205px no-repeat;filter:none;opacity:.9;-webkit-mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%);mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%)}
</style>
