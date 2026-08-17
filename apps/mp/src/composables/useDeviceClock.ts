import { onMounted, onUnmounted, ref } from 'vue';

export function useDeviceClock() {
  const timeLabel = ref(formatTime());
  let timer: number | undefined;

  onMounted(() => {
    timer = window.setInterval(() => {
      timeLabel.value = formatTime();
    }, 30_000);
  });

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer);
  });

  return { timeLabel };
}

function formatTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}
