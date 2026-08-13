<script setup lang="ts">
defineProps<{ type: string; input: string; result: string }>();
</script>

<template>
  <article class="tool-contract-card" :data-task="type">
    <template v-if="type === 'negative_rewrite'">
      <h3>改写对照</h3>
      <p><strong>原来的声音：</strong>{{ input }}</p>
      <p><strong>更温和的表达：</strong>{{ result }}</p>
    </template>

    <template v-else-if="type === 'rant'">
      <h3>安全情绪出口</h3>
      <p>这段文字允许释放情绪，同时保留不伤害自己和他人的边界。</p>
      <blockquote>{{ result }}</blockquote>
    </template>

    <template v-else-if="type === 'healing_phrase'">
      <h3>今日治愈短句</h3>
      <blockquote>“{{ result }}”</blockquote>
      <small>可复制到备忘录，留给需要被提醒的时刻。</small>
    </template>

    <template v-else-if="type === 'sleep_comfort'">
      <h3>今晚的缓冲提示</h3>
      <p><strong>此刻困扰：</strong>{{ input }}</p>
      <p><strong>慢慢放松：</strong>{{ result }}</p>
    </template>

    <template v-else-if="type === 'work_support'">
      <h3>工作破防拆解</h3>
      <p><strong>工作现场：</strong>{{ input }}</p>
      <p><strong>可控的下一步：</strong>{{ result }}</p>
    </template>

    <template v-else-if="type === 'future_letter'">
      <h3>写给未来的自己</h3>
      <p>这封信可以继续编辑，再决定是否保存为日记。</p>
      <p>{{ result }}</p>
    </template>

    <template v-else>
      <h3>本次工具结果</h3>
      <p>{{ result }}</p>
    </template>
  </article>
</template>
