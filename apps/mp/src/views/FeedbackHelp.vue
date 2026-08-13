<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, deleteMedia, resolveApiUrl, uploadMedia, type UploadedMedia } from '../api';

type FeedbackAsset = Pick<UploadedMedia, 'id' | 'url'> & { name: string };
type FeedbackTicket = { id: string; content: string; status?: string; createdAt?: string; reply?: string };

const router = useRouter();
const faqs = ref<any[]>([]);
const cats = ref<any[]>([]);
const categoryId = ref('');
const content = ref('');
const assets = ref<Array<FeedbackAsset | null>>([null, null]);
const tickets = ref<FeedbackTicket[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const openedFaq = ref('');
const support = ref(false);
const loading = ref(true);
const loadError = ref('');
const formMessage = ref('');
const submitting = ref(false);
const uploadingSlot = ref<number | null>(null);
const removingSlot = ref<number | null>(null);
const pendingSlot = ref(0);
const categoryPickerOpen = ref(false);

const visibleFaqs = computed(() => faqs.value.slice(0, 5));
const characterCount = computed(() => content.value.length);
const attachmentCount = computed(() => assets.value.filter(Boolean).length);
const assetIds = computed(() => assets.value.flatMap((asset) => asset ? [asset.id] : []));
const categoryLabel = computed(() => cats.value.find((category) => category.id === categoryId.value)?.name ?? '一般问题');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [faqResponse, categoryResponse, ticketResponse] = await Promise.all([
      api.get<any>('/api/v1/feedback/faqs'),
      api.get<any>('/api/v1/feedback/categories'),
      api.get<any>('/api/v1/feedback'),
    ]);
    faqs.value = faqResponse.items ?? [];
    cats.value = categoryResponse.items ?? [];
    tickets.value = ticketResponse.items ?? [];
    if (!cats.value.some((category) => category.id === categoryId.value)) categoryId.value = cats.value[0]?.id ?? '';
  } catch (error: any) {
    loadError.value = error?.message ?? '帮助内容加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status?: string) {
  return ({ open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' } as Record<string, string>)[status ?? ''] ?? '待处理';
}

function formatTime(value?: string) {
  return value ? value.slice(0, 16).replace('T', ' ') : '';
}

function chooseUploadSlot(slot: number) {
  if (uploadingSlot.value !== null || removingSlot.value !== null) return;
  pendingSlot.value = slot;
  fileInput.value?.click();
}

async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || uploadingSlot.value !== null) return;

  const slot = pendingSlot.value;
  uploadingSlot.value = slot;
  formMessage.value = '';
  try {
    const uploaded = await uploadMedia(file, 'feedback');
    const previous = assets.value[slot];
    const next = [...assets.value];
    next[slot] = { id: uploaded.id, url: resolveApiUrl(uploaded.url), name: file.name };
    assets.value = next;
    if (previous) await deleteMedia(previous.id).catch(() => undefined);
  } catch (error: any) {
    formMessage.value = error?.message ?? '截图上传失败，请选择 JPEG、PNG 或 WebP 图片后重试。';
  } finally {
    uploadingSlot.value = null;
  }
}

async function removeAsset(slot: number) {
  const asset = assets.value[slot];
  if (!asset || removingSlot.value !== null) return;
  removingSlot.value = slot;
  formMessage.value = '';
  try {
    await deleteMedia(asset.id);
    const next = [...assets.value];
    next[slot] = null;
    assets.value = next;
  } catch (error: any) {
    formMessage.value = error?.message ?? '截图删除失败，请稍后重试。';
  } finally {
    removingSlot.value = null;
  }
}

async function submit() {
  const text = content.value.trim();
  if (submitting.value) return;
  if (!text) {
    formMessage.value = '请先写下你遇到的问题或建议。';
    return;
  }

  submitting.value = true;
  formMessage.value = '';
  try {
    await api.post('/api/v1/feedback', {
      categoryId: categoryId.value || undefined,
      content: text,
      sourcePage: '/pages/help/feedback',
      assetIds: assetIds.value,
    });
    content.value = '';
    assets.value = [null, null];
    formMessage.value = '反馈已提交，后台工单已创建。';
    const ticketResponse = await api.get<any>('/api/v1/feedback');
    tickets.value = ticketResponse.items ?? [];
  } catch (error: any) {
    formMessage.value = error?.message ?? '提交失败，请确认网络后重试。';
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page feedback-page feedback-help-page">
    <template v-if="!loading">
      <header class="feedback-hero">
        <img class="feedback-tree" src="../assets/goodnight/tree-top-cutout.png" alt="" aria-hidden="true" />
        <img class="feedback-sprout" src="../assets/goodnight/profile-baby.png" alt="" aria-hidden="true" />
        <button class="feedback-back" data-testid="front-feedback-back" type="button" aria-label="返回上一页" @click="router.back()">‹</button>
        <div class="feedback-hero-copy">
          <p class="feedback-eyebrow">温柔的支持一直都在</p>
          <h1>帮助与反馈</h1>
          <p>有问题时，也让我们温柔陪你解决 <span aria-hidden="true">❧</span></p>
        </div>
      </header>

      <p v-if="loadError" class="feedback-load-error" role="status">{{ loadError }}</p>

      <section class="feedback-faq-card" aria-labelledby="feedback-faq-title">
        <div class="feedback-section-title"><span aria-hidden="true">❧</span><h2 id="feedback-faq-title">常见问题</h2></div>
        <div v-if="visibleFaqs.length" class="faq-list">
          <article
            v-for="(faq, index) in visibleFaqs"
            :key="faq.id"
            class="feedback-faq-item"
            :data-testid="index === 0 ? 'faq-item-first' : `faq-item-${index + 1}`"
          >
            <button type="button" :aria-expanded="openedFaq === faq.id" @click="openedFaq = openedFaq === faq.id ? '' : faq.id">
              <span class="faq-question-icon" aria-hidden="true">?</span>
              <strong>{{ faq.question }}</strong>
              <span class="faq-chevron" :class="{ open: openedFaq === faq.id }" aria-hidden="true">›</span>
            </button>
            <p v-if="openedFaq === faq.id">{{ faq.answer }}</p>
          </article>
        </div>
        <p v-else class="feedback-empty">暂时没有可展示的常见问题。</p>
        <button class="faq-all-button" data-testid="btn-faq-all" type="button" @click="router.push('/pages/help/faqs')"><span aria-hidden="true">❧</span> 查看全部问题 <span aria-hidden="true">›</span></button>
      </section>

      <form class="feedback-form-card" @submit.prevent="submit">
        <img class="feedback-form-sprout" src="../assets/goodnight/tool-baby-letter-cutout.png" alt="" aria-hidden="true" />
        <div class="feedback-form-heading">
          <div class="feedback-section-title"><span aria-hidden="true">❧</span><h2>提交反馈</h2></div>
          <button class="feedback-category-trigger" type="button" @click="categoryPickerOpen = true">更改类型</button>
        </div>
        <p class="feedback-form-intro">每一条反馈都会创建真实工单，由我们认真查看。</p>

        <label class="feedback-textarea-wrap" for="feedback-content">
          <textarea
            id="feedback-content"
            data-testid="input-feedback-content"
            v-model="content"
            maxlength="500"
            rows="5"
            placeholder="写下你的问题或建议……"
          />
          <span class="feedback-count" :class="{ limit: characterCount === 500 }">{{ characterCount }}/500</span>
        </label>

        <input ref="fileInput" class="feedback-file-input" data-testid="input-feedback-upload" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择反馈截图" @change="chooseFile" />
        <div class="feedback-upload-heading"><strong>上传截图</strong><span>可选，最多 2 张</span></div>
        <div class="feedback-upload-slots" :aria-label="`已上传 ${attachmentCount} 张截图`">
          <div v-for="slot in 2" :key="slot" class="feedback-upload-slot" :class="{ occupied: assets[slot - 1], loading: uploadingSlot === slot - 1 }">
            <template v-if="assets[slot - 1]">
              <img :src="assets[slot - 1]?.url" :alt="`反馈截图 ${assets[slot - 1]?.name}`" />
              <button class="feedback-remove-upload" type="button" :aria-label="`删除截图 ${slot}`" :disabled="removingSlot === slot - 1" @click="removeAsset(slot - 1)">{{ removingSlot === slot - 1 ? '…' : '×' }}</button>
            </template>
            <button
              v-else
              :data-testid="slot === 1 ? 'btn-feedback-upload' : 'btn-feedback-upload-2'"
              class="feedback-upload-button"
              type="button"
              :disabled="uploadingSlot !== null"
              @click="chooseUploadSlot(slot - 1)"
            >
              <span aria-hidden="true">＋</span>
              <em>{{ uploadingSlot === slot - 1 ? '上传中…' : '上传截图' }}</em>
            </button>
          </div>
        </div>
        <div v-if="attachmentCount" class="feedback-upload-preview" data-testid="feedback-upload-preview" aria-live="polite">已准备 {{ attachmentCount }} 张真实截图</div>

        <button class="feedback-submit" data-testid="btn-feedback-submit" type="submit" :disabled="submitting || uploadingSlot !== null">
          {{ submitting ? '正在提交…' : '提交反馈' }}
        </button>
        <p v-if="formMessage" class="feedback-form-status" role="status" aria-live="polite">{{ formMessage }}</p>
      </form>

      <div v-if="categoryPickerOpen" class="sheet-mask feedback-category-mask" role="dialog" aria-modal="true" aria-label="选择反馈类型">
        <section class="sheet menu-sheet feedback-category-sheet">
          <h2>选择反馈类型</h2>
          <p>当前：{{ categoryLabel }}</p>
          <select data-testid="select-feedback-category" v-model="categoryId" aria-label="反馈类型">
            <option v-for="category in cats" :key="category.id" :value="category.id">{{ category.name }}</option>
            <option v-if="!cats.length" value="">一般问题</option>
          </select>
          <div class="sheet-actions">
            <button class="primary" type="button" @click="categoryPickerOpen = false">确认</button>
          </div>
        </section>
      </div>

      <section class="emergency-support" aria-labelledby="emergency-support-title">
        <span class="emergency-heart" aria-hidden="true">♡</span>
        <div>
          <h2 id="emergency-support-title">紧急支持</h2>
          <p>如遇严重情绪危机，请及时联系专业帮助。</p>
          <small>全国心理援助热线：12356（24小时）</small>
        </div>
        <button data-testid="btn-support-more" type="button" @click="support = true">了解更多</button>
      </section>

      <section class="feedback-history" data-testid="feedback-ticket-history" aria-labelledby="feedback-history-title">
        <div class="feedback-history-heading"><h2 id="feedback-history-title">我的反馈</h2><span>{{ tickets.length }} 条</span></div>
        <article v-for="ticket in tickets" :key="ticket.id" class="feedback-ticket" :data-testid="`feedback-ticket-${ticket.id}`">
          <div class="ticket-meta"><strong>{{ statusLabel(ticket.status) }}</strong><span>{{ formatTime(ticket.createdAt) }}</span></div>
          <p>{{ ticket.content }}</p>
          <div v-if="ticket.reply" class="ticket-reply" data-testid="feedback-ticket-reply"><strong>管理员回复</strong><p>{{ ticket.reply }}</p></div>
          <small v-else>我们正在认真查看这条反馈。</small>
        </article>
        <p v-if="!tickets.length" class="feedback-empty">还没有提交过反馈，遇到问题可以告诉我们。</p>
      </section>

      <div v-if="support" class="support-dialog" data-testid="support-panel" role="dialog" aria-modal="true" aria-labelledby="support-dialog-title">
        <section class="support-dialog-card">
          <p class="support-kicker">需要更多陪伴时</p>
          <h2 id="support-dialog-title">更多支持</h2>
          <p>如果涉及现实危险，请优先联系当地紧急热线或专业帮助。晚安树洞可以陪你整理情绪，但不能替代紧急救助。</p>
          <button data-testid="btn-support-close" type="button" @click="support = false">我知道了</button>
        </section>
      </div>
    </template>

    <div v-else class="feedback-loading" role="status">正在读取帮助与反馈内容…</div>
  </section>
</template>

<style scoped>
.feedback-help-page {
  display: block;
  min-height: 100vh;
  padding: 0 14px calc(132px + env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(circle at 94% 4%, rgba(228, 239, 206, .68), transparent 22rem),
    linear-gradient(180deg, #fffdf8 0%, #fcf8ed 78%, #f8f1e3 100%);
  color: #2c382a;
}

.feedback-help-page *,
.feedback-help-page *::before,
.feedback-help-page *::after { box-sizing: border-box; }

.feedback-hero {
  position: relative;
  min-height: 236px;
  margin: 0 -14px 2px;
  padding: 35px 22px 28px;
  overflow: hidden;
  isolation: isolate;
}

.feedback-tree {
  position: absolute;
  top: -16px;
  right: -37px;
  z-index: -1;
  width: min(72vw, 330px);
  max-width: none;
  opacity: .78;
  pointer-events: none;
}

.feedback-sprout {
  position: absolute;
  right: 14%;
  bottom: 4px;
  z-index: -1;
  width: 90px;
  max-width: none;
  filter: drop-shadow(0 8px 12px rgba(67, 84, 46, .14));
  pointer-events: none;
}

.feedback-back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  min-height: 42px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #4c6e32;
  background: rgba(255, 253, 246, .68);
  box-shadow: none;
  font-size: 38px;
  line-height: 1;
}

.feedback-hero-copy { width: min(74%, 370px); margin-top: 25px; }
.feedback-eyebrow { margin: 0 0 6px; color: #74894e; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.feedback-hero h1 { margin: 0; color: #304829; font-family: var(--gn-font-display, "KaiTi", serif); font-size: clamp(34px, 10vw, 48px); letter-spacing: .06em; line-height: 1.08; }
.feedback-hero-copy > p:last-child { max-width: 280px; margin: 14px 0 0; color: #5c753c; font-size: 15px; line-height: 1.55; }
.feedback-load-error { margin: 2px 8px 14px; color: #a05d45; font-size: 13px; text-align: center; }

.feedback-faq-card,
.feedback-form-card,
.emergency-support,
.feedback-history {
  border: 1px solid rgba(126, 145, 83, .18);
  border-radius: 25px;
  background: rgba(255, 255, 252, .95);
  box-shadow: 0 14px 30px rgba(74, 84, 55, .08);
}

.feedback-faq-card { padding: 20px 18px 16px; }
.feedback-section-title { display: flex; gap: 10px; align-items: center; }
.feedback-section-title > span { color: #839a56; font-size: 27px; transform: rotate(-25deg); }
.feedback-section-title h2 { margin: 0; color: #30472a; font-family: var(--gn-font-display, "KaiTi", serif); font-size: 24px; }
.feedback-faq-card .faq-list { display: block; margin-top: 9px; }

.feedback-faq-item { border-bottom: 1px solid rgba(133, 145, 108, .16); }
.feedback-faq-item button { display: grid; grid-template-columns: 42px minmax(0, 1fr) 20px; gap: 8px; align-items: center; width: 100%; min-height: 58px; padding: 8px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: #333b31; text-align: left; }
.faq-question-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: #6d8548; background: #f6f3e5; font-family: Georgia, serif; font-size: 22px; }
.feedback-faq-item strong { overflow: hidden; color: #2e382d; font-size: 16px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.faq-chevron { color: #958d7d; font-size: 30px; font-weight: 300; line-height: 1; transition: transform .16s ease; }
.faq-chevron.open { transform: rotate(90deg); }
.feedback-faq-item p { margin: -1px 0 12px 42px; color: #697364; font-size: 14px; line-height: 1.65; }
.feedback-empty { margin: 14px 0 0; color: #75806f; font-size: 14px; line-height: 1.55; text-align: center; }
.faq-all-button { display: flex; gap: 8px; align-items: center; justify-content: center; width: 100%; min-height: 46px; margin-top: 9px; padding: 8px; border: 0; border-radius: 0; color: #4f7133; background: transparent; box-shadow: none; font-size: 16px; font-weight: 700; }
.faq-all-button span:first-child { color: #8ca65b; font-size: 22px; transform: rotate(-24deg); }
.faq-all-button span:last-child { font-size: 28px; font-weight: 300; }

.feedback-form-card { position: relative; display: grid; gap: 13px; margin-top: 20px; padding: 20px 18px 22px; overflow: hidden; }
.feedback-form-card::after { position: absolute; right: -12px; bottom: 54px; width: 102px; height: 102px; border-radius: 50%; background: radial-gradient(circle, rgba(244, 235, 204, .8), transparent 66%); content: ''; pointer-events: none; }
.feedback-form-card > :not(.feedback-form-sprout) { position: relative; z-index: 1; }
.feedback-form-sprout { position: absolute; right: 18px; bottom: 88px; z-index: 0; width: 78px; max-width: none; opacity: .54; pointer-events: none; }
.feedback-form-intro { margin: -6px 0 1px; color: #727c6c; font-size: 13px; line-height: 1.55; }

.feedback-form-heading { display: flex; gap: 14px; align-items: center; justify-content: space-between; }
.feedback-category { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 9px; align-items: center; min-height: 42px; color: #6b7b55; font-size: 13px; font-weight: 700; }
.feedback-category select { min-width: 0; min-height: 40px; padding: 7px 30px 7px 11px; border: 1px solid rgba(123, 143, 89, .28); border-radius: 14px; color: #3e4e38; background: rgba(255, 255, 250, .92); font-size: 14px; }
.feedback-textarea-wrap { position: relative; display: block; }
.feedback-textarea-wrap textarea { display: block; width: 100%; min-height: 151px; resize: vertical; padding: 16px 92px 40px 15px; border: 1px solid rgba(125, 143, 91, .24); border-radius: 18px; outline: 0; color: #334133; background: rgba(255, 255, 252, .95); font: inherit; font-size: 15px; line-height: 1.65; }
.feedback-textarea-wrap textarea:focus { border-color: #7d9851; box-shadow: 0 0 0 3px rgba(130, 156, 82, .12); }
.feedback-count { position: absolute; right: 14px; bottom: 12px; color: #8a9083; font-size: 13px; }
.feedback-count.limit { color: #a7654c; font-weight: 700; }
.feedback-file-input { position: absolute; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.feedback-upload-heading { display: flex; gap: 8px; align-items: baseline; color: #364334; }
.feedback-upload-heading strong { font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 18px; }
.feedback-upload-heading span { color: #8a9085; font-size: 13px; }
.feedback-upload-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
.feedback-upload-slot { position: relative; min-width: 0; aspect-ratio: 1.28; overflow: hidden; border: 1.5px dashed rgba(116, 143, 73, .5); border-radius: 17px; background: rgba(255, 254, 249, .9); }
.feedback-upload-slot.occupied { border-style: solid; }
.feedback-upload-slot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.feedback-upload-button { display: grid; place-items: center; gap: 3px; width: 100%; height: 100%; min-height: 0; padding: 10px; border: 0; border-radius: 0; color: #587638; background: transparent; box-shadow: none; }
.feedback-upload-button span { font-size: 29px; line-height: 1; }
.feedback-upload-button em { font-size: 13px; font-style: normal; }
.feedback-remove-upload { position: absolute; top: 7px; right: 7px; display: grid; place-items: center; width: 29px; height: 29px; min-height: 29px; padding: 0; border: 1px solid rgba(255, 255, 255, .8); border-radius: 50%; color: #fff; background: rgba(45, 55, 39, .65); box-shadow: none; font-size: 20px; line-height: 1; }
.feedback-upload-preview { margin-top: -4px; color: #607a3e; font-size: 13px; }
.feedback-submit { width: 100%; min-height: 54px; border: 0; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #8ba55e, #607e39); box-shadow: 0 10px 18px rgba(79, 111, 45, .22); font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 21px; letter-spacing: .08em; }
.feedback-submit:disabled, .feedback-upload-button:disabled { cursor: wait; opacity: .64; }
.feedback-form-status { margin: -1px 2px 0; color: #607a3e; font-size: 13px; line-height: 1.5; text-align: center; }

.emergency-support { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 10px; align-items: center; margin-top: 20px; padding: 16px; background: linear-gradient(135deg, rgba(255, 253, 247, .98), rgba(250, 247, 234, .94)); }
.emergency-heart { display: grid; place-items: center; width: 51px; height: 51px; border-radius: 50%; color: #d78d79; background: #fff3e9; font-size: 39px; line-height: 1; }
.emergency-support h2 { margin: 0 0 3px; color: #3b4735; font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 18px; }
.emergency-support p { margin: 0; color: #5f675c; font-size: 13px; line-height: 1.45; }
.emergency-support small { display: block; margin-top: 3px; color: #637c41; font-size: 12px; line-height: 1.45; }
.emergency-support button { min-height: 36px; padding: 7px 12px; border: 1px solid #718c4c; border-radius: 999px; color: #4c6a2e; background: #fffdf8; box-shadow: none; font-size: 13px; white-space: nowrap; }

.feedback-history { margin-top: 20px; padding: 18px; }
.feedback-history-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.feedback-history-heading h2 { margin: 0; color: #394933; font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 22px; }
.feedback-history-heading > span { color: #77816f; font-size: 13px; }
.feedback-ticket { padding: 14px 0; border-bottom: 1px solid rgba(133, 145, 108, .16); }
.feedback-ticket:last-of-type { border-bottom: 0; }
.ticket-meta { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.ticket-meta strong { color: #607e3a; font-size: 14px; }
.ticket-meta span, .feedback-ticket > small { color: #8a9085; font-size: 12px; }
.feedback-ticket > p { margin: 7px 0; color: #354035; font-size: 14px; line-height: 1.6; }
.ticket-reply { margin-top: 9px; padding: 10px 12px; border-radius: 13px; background: #f5f8ed; }
.ticket-reply strong { color: #587534; font-size: 13px; }
.ticket-reply p { margin: 4px 0 0; color: #586457; font-size: 13px; line-height: 1.55; }

.support-dialog { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(36, 46, 31, .32); backdrop-filter: blur(4px); }
.support-dialog-card { width: min(100%, 390px); padding: 27px; border: 1px solid rgba(255, 255, 255, .7); border-radius: 25px; background: #fffdf7; box-shadow: 0 24px 56px rgba(29, 37, 23, .22); }
.support-kicker { margin: 0 0 7px; color: #7c9652; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
.support-dialog-card h2 { margin: 0; color: #3f5c2e; font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 25px; }
.support-dialog-card > p:not(.support-kicker) { margin: 14px 0 21px; color: #5f695b; font-size: 15px; line-height: 1.7; }
.support-dialog-card button { width: 100%; min-height: 45px; border: 0; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #8ca65e, #63813b); }
.feedback-loading { display: grid; place-content: center; min-height: 100vh; color: #627b40; font-size: 14px; }

@media (max-width: 374px) {
  .feedback-help-page { padding-right: 11px; padding-left: 11px; }
  .feedback-hero { margin-right: -11px; margin-left: -11px; padding-right: 17px; padding-left: 17px; }
  .feedback-hero-copy { width: 73%; }
  .feedback-hero h1 { font-size: 34px; }
  .feedback-faq-card, .feedback-form-card, .feedback-history { padding-right: 14px; padding-left: 14px; }
  .feedback-faq-item strong { font-size: 15px; }
  .feedback-category { grid-template-columns: 57px minmax(0, 1fr); }
  .emergency-support { grid-template-columns: 45px minmax(0, 1fr); padding: 14px; }
  .emergency-heart { width: 43px; height: 43px; font-size: 33px; }
  .emergency-support button { grid-column: 2; justify-self: start; margin-top: 2px; }
}

/* Compact the real help and ticket form for 375–430px screens.  The form and
   file inputs remain the same elements and retain their persisted behaviour. */
.feedback-help-page {
  padding-right: 5px;
  padding-left: 5px;
  padding-bottom: calc(108px + env(safe-area-inset-bottom));
}

.feedback-hero {
  width: calc(100% + 10px);
  min-height: 154px;
  max-width: none;
  margin-right: -5px;
  margin-left: -5px;
  padding: 29px 22px 14px;
}

.feedback-tree {
  top: -24px;
  right: -24px;
  width: min(61vw, 264px);
  opacity: .8;
}

.feedback-sprout {
  right: 17%;
  bottom: -3px;
  width: 70px;
  clip-path: circle(48% at 50% 50%);
  opacity: .88;
}

.feedback-back {
  position: absolute;
  top: 29px;
  left: 4px;
  z-index: 2;
  width: 38px;
  height: 38px;
  min-height: 38px;
  border-radius: 0;
  background: transparent;
  font-size: 34px;
}

.feedback-hero-copy {
  width: min(74%, 292px);
  margin-top: 16px;
}

.feedback-eyebrow { display: none; }

.feedback-hero h1 {
  font-size: clamp(27px, 7.6vw, 33px);
  letter-spacing: .04em;
  line-height: 1.16;
}

.feedback-hero-copy > p:last-child {
  max-width: 290px;
  margin-left: 0;
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.5;
}

.feedback-faq-card,
.feedback-form-card,
.emergency-support,
.feedback-history { border-radius: 22px; }

.feedback-faq-card { padding: 12px 14px 9px; }
.feedback-section-title { gap: 7px; }
.feedback-section-title > span { font-size: 20px; }
.feedback-section-title h2 { font-size: 19px; }
.feedback-faq-card .faq-list { margin-top: 5px; }
.feedback-faq-item button { grid-template-columns: 32px minmax(0, 1fr) 16px; gap: 7px; min-height: 42px; padding: 5px 0; }
.faq-question-icon { width: 27px; height: 27px; font-size: 18px; }
.feedback-faq-item strong { font-size: 14px; }
.faq-chevron { font-size: 24px; }
.feedback-faq-item p { margin: -1px 0 8px 34px; font-size: 12px; line-height: 1.5; }
.faq-all-button { min-height: 34px; margin-top: 4px; padding: 3px; font-size: 14px; }
.faq-all-button span:first-child { font-size: 17px; }
.faq-all-button span:last-child { font-size: 22px; }

.feedback-form-card { gap: 7px; margin-top: 10px; padding: 13px 14px 14px; }
.feedback-form-card::after { right: -5px; bottom: 112px; width: 82px; height: 82px; }
.feedback-form-sprout { right: 11px; bottom: 137px; z-index: 2; width: 56px; opacity: .48; }
.feedback-form-intro { display: none; }
.feedback-form-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(126px, 46%); gap: 8px; }
.feedback-form-heading .feedback-section-title { min-width: 0; }
.feedback-category { position: relative; display: block; min-width: 0; min-height: 32px; }
.feedback-category > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.feedback-category select { width: 100%; min-height: 32px; padding: 4px 26px 4px 9px; border-radius: 11px; font-size: 12px; }
.feedback-textarea-wrap textarea { height: 76px; min-height: 76px; padding: 10px 68px 28px 11px; border-radius: 14px; font-size: 13px; line-height: 1.5; }
.feedback-count { right: 72px; bottom: 8px; font-size: 11px; }
.feedback-upload-heading strong { font-size: 16px; }
.feedback-upload-heading span { font-size: 11px; }
.feedback-upload-slots { gap: 8px; }
.feedback-upload-slot { aspect-ratio: 3.35; border-radius: 13px; }
.feedback-upload-button { gap: 1px; padding: 5px; }
.feedback-upload-button span { font-size: 22px; }
.feedback-upload-button em { font-size: 11px; }
.feedback-remove-upload { top: 4px; right: 4px; width: 23px; height: 23px; min-height: 23px; font-size: 16px; }
.feedback-upload-preview { font-size: 11px; }
.feedback-submit { min-height: 43px; font-size: 18px; }
.feedback-form-status { font-size: 11px; }

.emergency-support { grid-template-columns: 43px minmax(0, 1fr) auto; gap: 8px; margin-top: 10px; padding: 11px; }
.emergency-heart { width: 42px; height: 42px; font-size: 30px; }
.emergency-support h2 { font-size: 16px; }
.emergency-support p { font-size: 11px; line-height: 1.35; }
.emergency-support small { font-size: 10px; line-height: 1.35; }
.emergency-support button { min-height: 31px; padding: 5px 9px; font-size: 11px; }
.feedback-history { margin-top: 10px; padding: 13px; }

@media (max-width: 374px) {
  .feedback-help-page { padding-right: 4px; padding-left: 4px; }
  .feedback-hero { width: calc(100% + 8px); margin-right: -4px; margin-left: -4px; padding-right: 17px; padding-left: 17px; }
  .feedback-hero h1 { font-size: 27px; }
  .feedback-hero-copy { width: 77%; }
  .feedback-faq-card, .feedback-form-card, .feedback-history { padding-right: 11px; padding-left: 11px; }
  .feedback-form-heading { grid-template-columns: minmax(0, 1fr) minmax(122px, 45%); }
  .emergency-support { grid-template-columns: 39px minmax(0, 1fr); }
  .emergency-heart { width: 38px; height: 38px; }
  .emergency-support button { grid-column: 2; }
}

/* The tree is a reusable decorative crop, not a page screenshot. Its
   reference-frame placement is independent from the live FAQ and ticket UI. */
.feedback-tree {
  top: 31.07px;
  right: auto;
  left: 221.71px;
  width: 193.29px;
  height: 102px;
  opacity: 1;
}

/* Keep the real feedback category editable without forcing a native select
   into the first viewport. The chooser is a real form control in a focused
   sheet, not a display-only label. */
.feedback-form-heading { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.feedback-category-trigger { min-height: 30px; padding: 4px 9px; border: 1px solid rgba(112, 137, 76, .32); border-radius: 999px; color: #58763c; background: rgba(255, 255, 252, .84); font-size: 12px; }
.feedback-category-sheet { display: grid; gap: 12px; }
.feedback-category-sheet > p { margin: 0; color: #6d7864; font-size: 13px; }
.feedback-category-sheet select { width: 100%; min-height: 42px; border: 1px solid rgba(112, 137, 76, .28); border-radius: 13px; padding: 8px 10px; color: #42593b; background: #fffefa; font: inherit; }

/* The reference keeps its help heading lower within a fixed-height hero;
   shift only copy so the FAQ card and live form flow are unchanged. */
.feedback-hero-copy { margin-top: 35px; }
.feedback-hero h1 { font-size: clamp(36px, 9.1vw, 40px); }

/* Keep the live FAQ area stable when the configured FAQ set is shorter than
   the design sample.  The form remains a real form: its fields, uploads and
   submit action are merely tightened to the same handset rhythm. */
.feedback-faq-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 210px;
}

.feedback-faq-card .faq-list { align-content: start; }
.feedback-faq-card .faq-all-button { align-self: end; }

.feedback-category-trigger {
  min-height: 26px;
  padding: 2px 4px;
  border: 0;
  border-radius: 0;
  color: #58763c;
  background: transparent;
  box-shadow: none;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.feedback-form-card {
  gap: 4px;
  padding: 5px 14px 9px;
}

.feedback-form-heading { min-height: 26px; }
.feedback-upload-slots { gap: 8px; }
.feedback-upload-slot { aspect-ratio: 3.6; }
.feedback-submit { min-height: 42px; }

/* The FAQ and the genuine feedback form remain ordinary, keyboard-accessible
   controls; only their outer rhythm is restored so the fixed tab bar never
   clips a field or a submitted ticket. */
.feedback-help-page {
  overflow-x: clip;
  overflow-y: visible;
  padding-bottom: calc(124px + env(safe-area-inset-bottom));
}

.feedback-hero {
  min-height: 166px;
  padding-top: 31px;
  padding-bottom: 17px;
}

.feedback-faq-card { min-height: 216px; }
.feedback-form-card { margin-top: 12px; }
</style>
