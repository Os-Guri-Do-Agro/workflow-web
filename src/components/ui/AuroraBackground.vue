<script setup lang="ts">
withDefaults(
  defineProps<{
    intensity?: 'subtle' | 'medium' | 'bold'
  }>(),
  { intensity: 'subtle' },
)
</script>

<template>
  <div class="aurora" :class="`aurora--${intensity}`" aria-hidden="true">
    <div class="aurora-blob aurora-blob--1" />
    <div class="aurora-blob aurora-blob--2" />
    <div class="aurora-blob aurora-blob--3" />
    <div class="aurora-grid" />
    <div class="aurora-noise" />
  </div>
</template>

<style scoped>
.aurora {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  contain: strict;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(92px);
  opacity: 0.55;
  mix-blend-mode: screen;
  will-change: transform;
}

:global([data-theme='light']) .aurora-blob {
  opacity: 0.32;
  mix-blend-mode: multiply;
  filter: blur(84px);
}

.aurora--subtle .aurora-blob {
  opacity: 0.38;
}

:global([data-theme='light']) .aurora--subtle .aurora-blob {
  opacity: 0.2;
}

.aurora-blob--1 {
  width: 520px;
  height: 520px;
  top: -180px;
  left: -120px;
  background: radial-gradient(closest-side, var(--accent), transparent 70%);
  animation: drift-1 22s ease-in-out infinite alternate;
}

.aurora-blob--2 {
  width: 640px;
  height: 640px;
  top: 20%;
  right: -220px;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 80%, #7c3aed), transparent 68%);
  animation: drift-2 28s ease-in-out infinite alternate;
}

.aurora-blob--3 {
  width: 560px;
  height: 560px;
  bottom: -220px;
  left: 30%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 60%, #2563eb), transparent 72%);
  animation: drift-3 32s ease-in-out infinite alternate;
}

@keyframes drift-1 {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(120px, 90px, 0) scale(1.1);
  }
}

@keyframes drift-2 {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(-140px, 70px, 0) scale(0.95);
  }
}

@keyframes drift-3 {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(100px, -130px, 0) scale(1.15);
  }
}

.aurora-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--text) 4%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--text) 4%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%);
  opacity: 0.55;
}

.aurora-noise {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.11 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity: 0.22;
  mix-blend-mode: overlay;
}

:global([data-theme='light']) .aurora-noise {
  opacity: 0.12;
  mix-blend-mode: multiply;
}

@media (prefers-reduced-motion: reduce) {
  .aurora-blob {
    animation: none;
  }
}
</style>
