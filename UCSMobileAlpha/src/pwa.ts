import { registerSW } from "virtual:pwa-register";

export const updatePwa = registerSW({
  immediate: true,
  onRegistered(registration) {
    console.log("PWA service worker registered", registration);
  },
  onOfflineReady() {
    console.log("PWA offline ready");
  },
  onNeedRefresh() {
    console.log("새 버전이 준비되었습니다. 앱을 다시 열어 주세요.");
  },
  onRegisterError(error) {
    console.error("PWA register error", error);
  },
});