<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi, tokenKey } from '../api';
import loginSceneUrl from '../assets/login-scene-reference.png';

const router = useRouter();
const username = ref('');
const password = ref('');
const captcha = ref('');
const remember = ref(true);
const error = ref('');
const notice = ref('');

async function login() {
  error.value = '';
  notice.value = '';
  if (!username.value.trim() || !password.value.trim()) {
    error.value = '请输入管理员账号和密码';
    return;
  }
  try {
    const res = await adminApi.post<any>('/api/admin/v1/auth/login', {
      username: username.value.trim(),
      password: password.value,
    });
    if (remember.value) localStorage.setItem(tokenKey, res.token);
    else {
      localStorage.removeItem(tokenKey);
      sessionStorage.setItem(tokenKey, res.token);
    }
    router.push('/dashboard');
  } catch (event: any) {
    error.value = event?.message ?? '登录失败';
  }
}

function forgotPassword() {
  notice.value = '请联系系统管理员重置后台账号。';
}
</script>

<template>
  <section class="login">
    <img class="login-scene login-scene-reference" :src="loginSceneUrl" alt="" aria-hidden="true" />
    <svg class="login-scene legacy-login-scene" viewBox="0 0 560 620" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="login-tree-leaves" x1="111" y1="144" x2="270" y2="389" gradientUnits="userSpaceOnUse">
          <stop stop-color="#B8CA91" />
          <stop offset="1" stop-color="#718D5A" />
        </linearGradient>
        <linearGradient id="login-tree-trunk" x1="252" y1="300" x2="344" y2="500" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F5E2AF" />
          <stop offset="1" stop-color="#D2AD6B" />
        </linearGradient>
        <linearGradient id="login-door" x1="302" y1="364" x2="381" y2="506" gradientUnits="userSpaceOnUse">
          <stop stop-color="#8EA36E" />
          <stop offset="1" stop-color="#4B6A4A" />
        </linearGradient>
        <filter id="login-tree-shadow" x="38" y="112" width="413" height="424" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#7B805A" flood-opacity=".15" />
        </filter>
      </defs>
      <ellipse class="scene-ground-glow" cx="256" cy="535" rx="224" ry="48" />
      <path class="scene-path" d="M316 497C329 530 385 548 472 575H560V620H234C210 603 209 586 232 571C271 546 300 527 316 497Z" />
      <g class="scene-stars">
        <path d="M82 159L86 170L97 174L86 178L82 189L78 178L67 174L78 170L82 159Z" />
        <path d="M160 91L163 99L171 102L163 105L160 113L157 105L149 102L157 99L160 91Z" />
        <path d="M415 226L418 234L426 237L418 240L415 248L412 240L404 237L412 234L415 226Z" />
        <circle cx="104" cy="229" r="3" />
        <circle cx="444" cy="150" r="3" />
        <circle cx="187" cy="193" r="2.5" />
      </g>
      <path class="scene-moon" d="M442 88C427 100 424 124 436 140C448 156 470 160 486 149C478 165 462 177 443 177C417 177 396 156 396 130C396 108 411 90 432 85C435 84 439 85 442 88Z" />
      <g filter="url(#login-tree-shadow)">
        <path class="scene-leaves scene-leaves-back" d="M76 348C56 320 64 275 96 258C75 229 94 180 136 177C145 134 198 117 228 147C253 119 300 126 320 158C360 145 394 170 393 207C427 229 420 278 391 295C402 336 367 371 327 364C299 397 247 397 218 369C182 390 133 376 122 342C103 354 88 354 76 348Z" />
        <path class="scene-leaves" d="M103 333C80 307 91 269 124 257C107 223 133 187 169 193C180 154 232 145 254 177C283 151 327 168 332 205C370 203 391 238 375 270C400 295 384 333 349 338C337 373 287 382 260 352C229 377 183 364 177 331C150 346 122 347 103 333Z" />
        <path class="scene-trunk" d="M224 500C236 446 249 385 241 315C232 287 218 263 193 239C190 229 198 220 209 222C232 244 247 265 261 292C269 252 283 221 312 191C322 183 335 193 331 204C302 243 286 287 286 332C300 310 318 292 345 276C358 273 365 286 357 296C323 325 307 355 305 390C303 430 324 467 343 500H224Z" />
        <path class="scene-bark" d="M268 304C265 361 274 422 284 499M238 365C256 349 273 342 289 340M225 430C246 412 265 406 288 407" />
        <path class="scene-door-frame" d="M294 500V389C294 350 323 322 359 322C395 322 424 350 424 389V500H294Z" />
        <path class="scene-door" d="M306 500V393C306 361 329 338 359 338C389 338 412 361 412 393V500H306Z" />
        <path class="scene-door-lines" d="M341 346V500M376 346V500M306 413H412" />
        <circle class="scene-door-handle" cx="394" cy="426" r="5" />
        <path class="scene-lantern-line" d="M426 389L443 378V434" />
        <path class="scene-lantern" d="M434 402H453L450 431H437L434 402Z" />
      </g>
      <path class="scene-shrub" d="M35 500C45 470 75 462 94 478C108 448 146 446 159 476C179 448 220 458 227 494V517H35V500Z" />
      <path class="scene-shrub scene-shrub-right" d="M404 494C416 464 449 462 461 480C475 451 512 457 523 491C541 482 554 489 560 501V518H394L404 494Z" />
    </svg>
    <form class="login-card" @submit.prevent="login">
      <div class="login-brand">
        <svg class="login-brand-mark" viewBox="0 0 72 72" fill="none" aria-hidden="true" focusable="false">
          <circle cx="36" cy="36" r="35" fill="#EEF3E8" />
          <path d="M17 34C15 21 25 11 37 13C47 11 58 20 56 33C62 43 54 56 43 55H24C13 55 8 42 17 34Z" fill="#728D59" />
          <path d="M37 25V52M37 32L29 24M37 35L45 27M37 40L28 34M37 42L46 36" stroke="#FFFDF8" stroke-width="2" stroke-linecap="round" />
          <path d="M28 53V45C28 39 32 35 36 35C40 35 44 39 44 45V53H28Z" fill="#FFFDF8" />
          <path d="M32 53V45C32 42 34 40 36 40C38 40 40 42 40 45V53" stroke="#E1EAD8" stroke-width="1.5" />
        </svg>
        <div>
          <h1>晚安树洞管理后台</h1>
          <p>管理员登录</p>
        </div>
      </div>

      <label class="login-field">
        <span class="login-field-label">账号</span>
        <span class="login-input-wrap">
          <svg class="login-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20C4.5 16.4 7.9 14 12 14C16.1 14 19.5 16.4 19.5 20" /></svg>
          <input data-testid="admin-login-username" v-model="username" aria-label="账号" autocomplete="username" placeholder="请输入账号" />
        </span>
      </label>
      <label class="login-field">
        <span class="login-field-label">密码</span>
        <span class="login-input-wrap">
          <svg class="login-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2" /><path d="M8.5 10V7.5C8.5 5.6 10.1 4 12 4C13.9 4 15.5 5.6 15.5 7.5V10M12 14V16" /></svg>
          <input data-testid="admin-login-password" v-model="password" type="password" aria-label="密码" autocomplete="current-password" placeholder="请输入密码" />
        </span>
      </label>
      <label class="login-field">
        <span class="login-field-label">验证码</span>
        <div class="captcha-row">
          <span class="login-input-wrap">
            <svg class="login-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3L19 6V11.5C19 16.2 16 19.4 12 21C8 19.4 5 16.2 5 11.5V6L12 3Z" /><path d="M9 12L11 14L15.5 9.5" /></svg>
            <input data-testid="admin-login-captcha" v-model="captcha" aria-label="验证码" inputmode="text" autocomplete="one-time-code" placeholder="请输入验证码" />
          </span>
          <output class="captcha-code">7 · 3 · K · 8</output>
        </div>
      </label>

      <div class="login-options">
        <label><input type="checkbox" v-model="remember" /> 记住我</label>
        <button type="button" class="text-button" data-testid="admin-forgot-password" @click="forgotPassword">忘记密码</button>
      </div>

      <button class="primary" data-testid="admin-login-submit" type="submit">登录</button>
      <p v-if="error" class="danger login-feedback">{{ error }}</p>
      <p v-if="notice" class="muted login-feedback">{{ notice }}</p>

      <div class="login-security">
        <svg class="login-security-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3L19 6V11.5C19 16.2 16 19.4 12 21C8 19.4 5 16.2 5 11.5V6L12 3Z" /><path d="M9 12L11 14L15.5 9.5" /></svg>
        <div><b>仅限管理员使用</b><small>为保障系统安全，请勿泄露您的账号信息</small></div>
      </div>
    </form>
    <p class="login-copyright">© 2025 晚安树洞管理后台 · 保留所有权利</p>
  </section>
</template>
