<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const home = ref<any>(null);
const form = ref({ title: '', domain: '工作', content: '' });

async function load() {
  loading.value = true;
  try { home.value = (await api.get<any>('/api/v1/tonight')).item; } catch (cause: any) { error.value = cause?.message ?? '今晚内容加载失败'; } finally { loading.value = false; }
}

async function createJourney() {
  if (!form.value.content.trim()) { error.value = '先写下今晚想处理的一件事'; return; }
  saving.value = true; error.value = '';
  try {
    const response = await api.post<any>('/api/v1/journeys', form.value);
    router.push(`/pages/journey/detail?id=${response.journey.id}`);
  } catch (cause: any) { error.value = cause?.message ?? '旅程创建失败'; } finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page modern-page tonight-page">
    <header class="modern-hero">
      <div class="status-row"><span>23:17</span><span>92</span></div>
      <p class="eyebrow">GOODNIGHT TREEHOLE</p>
      <h1>今晚，先照顾现实里的这一件事</h1>
      <p>把心情说清楚，再找到一小步能落地的行动。</p>
    </header>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="loading" class="soft-note">正在读取今晚的记录...</p>

    <template v-else>
      <section v-if="home?.journey" class="modern-card journey-summary-card">
        <div class="card-heading"><div><span class="section-kicker">正在陪跑</span><h2>{{ home.journey.title }}</h2></div><span class="stage-badge">{{ home.journey.stage }}</span></div>
        <p>{{ home.journey.summary || '情境分析正在整理，先由你确认哪些内容准确。' }}</p>
        <div class="metric-row"><span>{{ home.counts.activeActions }} 个进行中的行动</span><span>{{ home.counts.dueCheckins }} 个待回顾</span></div>
        <button class="primary-button" @click="router.push(`/pages/journey/detail?id=${home.journey.id}`)">打开旅程</button>
      </section>

      <section v-else class="modern-card create-journey-card">
        <span class="section-kicker">开始一段旅程</span>
        <h2>今晚最想理清什么？</h2>
        <p>只需要选一个现实困境，不必一次解决所有问题。</p>
        <label>这件事的标题<input v-model="form.title" placeholder="例如：准备一次重要沟通" /></label>
        <label>属于哪个领域<select v-model="form.domain"><option>工作</option><option>关系</option><option>生活</option><option>学习</option><option>其他</option></select></label>
        <label>事情是怎样的<textarea v-model="form.content" maxlength="1000" placeholder="写下已经发生的事实、你的感受，或现在最卡住的地方" /></label>
        <button class="primary-button" :disabled="saving" @click="createJourney">{{ saving ? '正在建立旅程...' : '开始整理' }}</button>
      </section>

      <section class="modern-card tonight-actions">
        <div class="card-heading"><h2>今晚的下一步</h2><button class="text-button" @click="router.push('/pages/action/index')">查看行动</button></div>
        <div v-if="home?.activeActions?.length" class="action-list"><button v-for="action in home.activeActions" :key="action.id" @click="router.push(`/pages/action/index?journeyId=${home.journey.id}`)"><span>{{ action.title }}</span><b>›</b></button></div>
        <p v-else class="empty-note">还没有行动。先把一件事说清楚，下一步会从你的确认里长出来。</p>
      </section>

      <section class="modern-card quiet-entry"><span>想先看看别人的经历？</span><button class="outline-button" @click="router.push('/pages/peers/index')">进入同路</button></section>
    </template>
  </section>
</template>

<style scoped>
.modern-page { display: grid; gap: 16px; padding: 0 14px 150px; }
.modern-hero { position: relative; min-height: 214px; padding: 28px 12px 24px; overflow: hidden; border-radius: 0 0 34px 34px; background: linear-gradient(135deg, #f8f4e9 0%, #e9f0df 100%); }
.modern-hero::after { position: absolute; right: -14px; bottom: -18px; width: 190px; height: 190px; background: url('../assets/goodnight/tree-top-cutout.png') center / cover no-repeat; opacity: .38; content: ''; pointer-events: none; }
.modern-hero .status-row { position: relative; z-index: 1; display: flex; justify-content: space-between; font-weight: 700; }
.eyebrow,.section-kicker { color: var(--gn-green); font-size: 12px; letter-spacing: .06em; }
.modern-hero h1 { position: relative; z-index: 1; max-width: 290px; margin: 34px 0 8px; color: var(--gn-green-dark); font-family: var(--gn-font-display); font-size: 32px; line-height: 1.28; }
.modern-hero p:last-child { position: relative; z-index: 1; margin: 0; color: var(--gn-subtext); }
.modern-card { border: 1px solid var(--gn-border); border-radius: var(--gn-radius-card); background: var(--gn-card); box-shadow: var(--gn-shadow-card); padding: 22px; }
.modern-card h2 { margin: 6px 0 8px; color: var(--gn-text); font-size: 21px; }
.modern-card p { color: var(--gn-subtext); line-height: 1.7; }
.card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
.stage-badge { padding: 6px 10px; border-radius: var(--gn-radius-pill); background: var(--gn-green-light); color: var(--gn-green-dark); font-size: 12px; }
.metric-row { display: flex; gap: 10px; margin: 18px 0; color: var(--gn-subtext); font-size: 13px; }
label { display: grid; gap: 7px; margin-top: 15px; color: var(--gn-subtext); font-size: 13px; }
input,select,textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--gn-border); border-radius: 16px; background: #fffdf8; padding: 12px 14px; color: var(--gn-text); font: inherit; }
textarea { min-height: 112px; resize: vertical; line-height: 1.6; }
.primary-button,.outline-button,.text-button { cursor: pointer; border: 0; font: inherit; }
.primary-button { width: 100%; margin-top: 18px; border-radius: 18px; padding: 13px 18px; background: var(--gn-green); color: white; }
.primary-button:disabled { opacity: .6; cursor: wait; }
.outline-button { border: 1px solid var(--gn-border); border-radius: 18px; padding: 10px 14px; background: transparent; color: var(--gn-green-dark); }
.text-button { background: transparent; color: var(--gn-green); }
.action-list { display: grid; gap: 8px; }
.action-list button { display: flex; justify-content: space-between; padding: 13px 0; border: 0; border-bottom: 1px solid var(--gn-border); background: transparent; color: var(--gn-text); text-align: left; font: inherit; }
.empty-note { margin-bottom: 0; }
.quiet-entry { display: flex; align-items: center; justify-content: space-between; color: var(--gn-text); }
.error-text { margin: 0 4px; color: var(--gn-danger); }
</style>
