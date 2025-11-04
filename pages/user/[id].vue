<template>
  <div class="container">
    <h1>User Detail</h1>
    <div class="card">
      <p><strong>User ID:</strong> {{ route.params.id }}</p>
      <p><strong>Full path:</strong> {{ route.fullPath }}</p>
      <p><strong>File location:</strong> pages/user/[id].vue</p>
    </div>
    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>
  </div>
</template>

<script setup>
const route = useRoute()
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: sans-serif;
}

.card {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin: 20px 0;
}

.back-link {
  display: inline-block;
  padding: 10px 20px;
  background: #00dc82;
  color: white;
  text-decoration: none;
  border-radius: 8px;
}
</style>
