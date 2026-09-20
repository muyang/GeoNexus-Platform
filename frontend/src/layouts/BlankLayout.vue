<template>
  <div class="blank-shell"><slot /></div>
</template>
<style scoped>
.blank-shell { min-height: 100%; display: grid; place-items: center;
  background: radial-gradient(1200px 600px at 20% 0%, #e0f7ff, var(--p-bg)); padding: 32px; }
</style>
