<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const primaryMatch = computed(() => item.value?.matches[0]);
const secondaryMatches = computed(() => (item.value?.matches ?? []).slice(1, 3));
const publishedExperiences = computed(() => {
  const matchedExperienceIds = new Set((item.value?.matches ?? []).map((match) => match.experience?.id).filter(Boolean));
  return (item.value?.experiences ?? []).filter((experience) => !matchedExperienceIds.has(experience.id)).slice(0, 2);
});

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
      <div class="hero-top"><span class="hero-brand"><i aria-hidden="true"></i>晚安树洞</span><span class="hero-mark">匿名同路</span></div>
      <div class="hero-copy"><h1>有人也走过<br>相似的路</h1><p>先看故事，再决定要不要靠近。</p></div>
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
        <div class="section-heading"><div><span class="heading-leaf" aria-hidden="true"></span><h2>和你很像的经历</h2></div><button type="button" @click="load">换一批</button></div>
        <article v-if="primaryMatch" class="peer-story-card peer-story-card--primary">
          <div class="story-meta"><span>{{ primaryMatch.experience?.domain || '匿名经历' }} · {{ ago(primaryMatch.experience?.createdAt || '') }}</span><span class="later-pill">真实后来</span></div>
          <h3>{{ primaryMatch.experience?.title || '一段匿名经历' }}</h3>
          <p class="story-quote">{{ primaryMatch.reasons.join(' · ') || '这段经历和你眼前的处境有一些相似。' }}</p>
          <div class="story-tags"><span v-for="reason in primaryMatch.reasons.slice(0, 3)" :key="reason">{{ reason }}</span></div>
          <div class="story-footer"><span>{{ primaryMatch.experience?.laterRecordCount ? `留下了 ${primaryMatch.experience.laterRecordCount} 段后来` : '留下一点后来' }}</span><button type="button" @click="openExperience(primaryMatch)">{{ primaryMatch.status === 'requested' ? '等待回应' : primaryMatch.status === 'connected' ? '查看进展' : '看看 TA 后来怎么样' }}</button></div>
        </article>
        <p v-else class="empty-note">暂时还没有足够接近的同路经历。你正在走的路会慢慢变得更清楚。</p>
        <article v-for="match in secondaryMatches" :key="match.id" class="peer-story-card peer-story-card--secondary">
          <div class="secondary-copy"><span>{{ match.experience?.domain || '匿名经历' }} · {{ ago(match.experience?.createdAt || '') }}</span><h3>{{ match.experience?.title || '另一段匿名经历' }}</h3><p>{{ match.reasons[0] || '也许能给你一点不一样的陪伴。' }}</p></div>
          <button type="button" :aria-label="`查看 ${match.experience?.title || '匿名经历'}`" @click="openExperience(match)">›</button>
        </article>
      </section>
      <section v-if="publishedExperiences.length" class="public-block">
        <div class="section-heading section-heading--quiet"><div><span class="heading-leaf" aria-hidden="true"></span><h2>还有一些人，留下了后来</h2></div></div>
        <button v-for="experience in publishedExperiences" :key="experience.id" type="button" class="public-row" @click="openPublished(experience)"><span class="row-sprout" aria-hidden="true"></span><span><strong>{{ experience.title }}</strong><small>{{ experience.domain }} · {{ experience.graduated ? '已经走过一段' : '仍在慢慢走' }}</small></span><b aria-hidden="true"></b></button>
        <p v-if="item.limited" class="limit-note">今晚先看到这里，明天也会有新的后来。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.peer-network-page{display:grid;align-content:start;gap:13px;padding:0 16px 142px;background:linear-gradient(180deg,#19313a 0 190px,#fbf8ef 190px)}
.peer-hero{position:relative;min-height:181px;margin:0 -16px;padding:18px 25px;overflow:hidden;color:#f7f2df;background:linear-gradient(118deg,#162b34 0 43%,#31484b 100%)}
.hero-top,.hero-copy{position:relative;z-index:1}.hero-top{display:flex;align-items:center;justify-content:space-between;font-size:12px}.hero-brand{display:inline-flex;align-items:center;gap:7px;font-weight:700}.hero-brand i{width:18px;height:18px;border:1px solid rgba(240,247,227,.72);border-radius:50% 50% 48% 11%;transform:rotate(-35deg)}.hero-mark{padding:4px 9px;border:1px solid rgba(255,255,255,.32);border-radius:999px}.hero-copy{margin-top:27px}.peer-hero h1{margin:0;color:#fff9e8;font-family:var(--gn-font-display);font-size:30px;font-weight:400;line-height:1.16;text-shadow:0 2px 12px rgba(9,25,29,.25)}.peer-hero p{max-width:230px;margin:7px 0 0;color:#e7ead9;font-size:13px;line-height:1.6}.peer-hero::after{position:absolute;right:-10px;bottom:-8px;width:250px;height:171px;background:url('../assets/goodnight/peer/peer-night-hero.png') right bottom/auto 171px no-repeat;content:'';opacity:.96;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 32%,#000);mask-image:linear-gradient(90deg,transparent 0%,#000 32%,#000)}
.peer-tabs{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:-14px;padding:4px;border:1px solid rgba(215,207,184,.82);border-radius:999px;background:#fffdf8;box-shadow:0 9px 23px rgba(30,45,39,.13)}.peer-tabs button{min-height:39px;border:0;border-radius:999px;background:transparent;color:#7c7b71;font:inherit;cursor:pointer}.peer-tabs .active{background:#fffef9;color:var(--gn-green-dark);box-shadow:inset 0 -2px 0 var(--gn-green)}
.state-note,.empty-note{margin:34px 10px;color:var(--gn-subtext);line-height:1.7;text-align:center}.error-note{margin:0;color:var(--gn-danger);text-align:center}.boundary-card,.peer-story-card,.public-block{border:1px solid var(--gn-border);border-radius:20px;background:rgba(255,254,249,.94);box-shadow:var(--gn-shadow-card)}.boundary-card{padding:24px;text-align:center}.boundary-card h2{margin:8px 0;color:var(--gn-green-dark)}.boundary-card p{margin:0;color:var(--gn-subtext);line-height:1.7}.boundary-card button,.story-footer button{min-height:44px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.boundary-card button{width:100%;margin-top:18px}.recommend-block{display:grid;gap:10px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 8px 1px}.section-heading>div{display:flex;align-items:center;gap:8px;min-width:0}.heading-leaf{display:inline-block;width:13px;height:13px;border:1px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.section-heading h2{margin:0;color:#394b39;font-family:var(--gn-font-display);font-size:18px;font-weight:400}.section-heading button{border:0;background:transparent;color:var(--gn-green);font:inherit;font-size:12px;cursor:pointer}.peer-story-card{position:relative;overflow:hidden}.peer-story-card--primary{min-height:190px;padding:15px 16px 14px}.peer-story-card--primary::after{position:absolute;right:-2px;bottom:-1px;width:166px;height:128px;background:url('../assets/goodnight/peer/peer-bench-scene.png') right bottom/contain no-repeat;content:'';opacity:.56;pointer-events:none}.story-meta,.story-tags,.story-footer,.peer-story-card h3,.story-quote{position:relative;z-index:1}.story-meta{display:flex;align-items:center;justify-content:space-between;gap:9px;color:#87907d;font-size:11px}.later-pill{padding:4px 8px;border-radius:999px;background:#eef1df;color:#6d7a48;font-size:11px}.peer-story-card h3{max-width:250px;margin:11px 0 8px;color:#283a2d;font-family:var(--gn-font-display);font-size:21px;font-weight:400;line-height:1.26}.story-quote{max-width:242px;margin:0;color:#677063;font-size:13px;line-height:1.6}.story-tags{display:flex;flex-wrap:wrap;gap:6px;max-width:242px;margin-top:10px}.story-tags span{padding:4px 8px;border-radius:999px;background:#f4eee6;color:#886e62;font-size:10px}.story-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(95,127,62,.15)}.story-footer span{color:#798174;font-size:11px}.story-footer button{min-height:34px;padding:0 12px;font-size:11px}.peer-story-card--secondary{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;gap:10px;min-height:92px;padding:14px 16px}.secondary-copy{display:grid;gap:4px;min-width:0}.secondary-copy>span{color:#87907d;font-size:11px}.secondary-copy h3{margin:0;color:#354737;font-size:16px}.secondary-copy p{margin:0;color:#687267;font-size:12px;line-height:1.45}.peer-story-card--secondary>button{position:relative;z-index:1;width:31px;height:31px;border:0;border-radius:50%;background:#f5f3e8;color:var(--gn-green);font-size:25px;line-height:1;cursor:pointer}.public-block{display:grid;gap:0;padding:13px 16px}.section-heading--quiet{padding:0 0 7px}.section-heading--quiet h2{font-size:16px}.public-row{display:grid;grid-template-columns:27px minmax(0,1fr)18px;align-items:center;gap:8px;width:100%;padding:11px 0;border:0;border-top:1px solid var(--gn-border);background:transparent;text-align:left;cursor:pointer}.public-row span:nth-child(2){display:grid;gap:3px}.public-row strong{overflow:hidden;color:var(--gn-text);font-size:13px;text-overflow:ellipsis;white-space:nowrap}.public-row small{overflow:hidden;color:var(--gn-subtext);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.limit-note{margin:11px 0 0;color:var(--gn-subtext);font-size:11px;text-align:center}.boundary-card ul{display:grid;gap:7px;margin:16px 0 0;padding:0;list-style:none;color:var(--gn-text);font-size:13px;line-height:1.55;text-align:left}.boundary-card li{padding:9px 11px;border-radius:12px;background:#f6f7ef}.boundary-card .privacy-link{min-height:34px;margin-top:4px;background:transparent;color:var(--gn-green-dark);text-decoration:underline}.leaf-glyph,.row-sprout{display:inline-block;position:relative;flex:0 0 auto;color:transparent}.leaf-glyph{width:26px;height:26px;border:1.5px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.leaf-glyph::after{position:absolute;left:50%;top:4px;height:19px;border-left:1px solid var(--gn-green);content:''}.row-sprout{width:16px;height:16px;border:1.5px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.row-sprout::after{position:absolute;left:7px;top:2px;height:12px;border-left:1px solid var(--gn-green);content:''}.public-row b{width:8px;height:8px;border-top:1.5px solid var(--gn-green);border-right:1.5px solid var(--gn-green);transform:rotate(45deg)}
</style>
