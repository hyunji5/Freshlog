/* =========================================================
   main.js — 이메일 사전등록 폼, FAQ 아코디언, GA4 이벤트 훅,
   섹션 뷰 트래킹 (바닐라 JS, IIFE 모듈 패턴)
   ========================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     GA4 이벤트 훅 wrapper
     실제 GA4 스크립트 연동 전까지는 dataLayer push + console.debug로 대체.
     추후 gtag.js 연동 시 이 함수 내부만 교체하면 됨.
  --------------------------------------------------------- */
  function trackEvent(eventName, params) {
    const payload = Object.assign({ event: eventName }, params || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    if (window.console && typeof window.console.debug === "function") {
      window.console.debug("[GA4]", eventName, params || {});
    }
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const STORAGE_KEY = "freshlog_signup_emails";

  function getStoredEmails() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function storeEmail(email) {
    try {
      const emails = getStoredEmails();
      emails.push(email.toLowerCase());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
    } catch (e) {
      /* localStorage 접근 불가 환경(프라이빗 모드 등) — 무시 */
    }
  }

  function isDuplicateEmail(email) {
    return getStoredEmails().indexOf(email.toLowerCase()) !== -1;
  }

  /* ---------------------------------------------------------
     이메일 사전등록 폼 (Hero + 최종 CTA 공용 로직)
  --------------------------------------------------------- */
  function setupEmailForm(form) {
    if (!form) return;

    const input = form.querySelector(".email-form__input");
    const errorEl = form.querySelector(".email-form__error");
    const successEl = form.querySelector(".email-form__success");
    const submitBtn = form.querySelector(".email-form__submit");

    if (!input || !errorEl || !submitBtn) return;

    function showError(message, muted) {
      errorEl.textContent = message;
      errorEl.classList.toggle("is-muted", !!muted);
      input.classList.toggle("is-error", !muted);
      input.setAttribute("aria-invalid", muted ? "false" : "true");
    }

    function clearError() {
      errorEl.textContent = "";
      errorEl.classList.remove("is-muted");
      input.classList.remove("is-error");
      input.removeAttribute("aria-invalid");
    }

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? "등록 중..." : "사전 가입하기";
    }

    function showSuccess() {
      const field = form.querySelector(".email-form__field");
      if (field) field.hidden = true;
      submitBtn.hidden = true;
      if (successEl) successEl.hidden = false;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearError();

      const email = (input.value || "").trim();

      if (!EMAIL_REGEX.test(email)) {
        showError("올바른 이메일 형식이 아니에요");
        trackEvent("email_signup_error", { reason: "invalid_format", form_id: form.id });
        return;
      }

      if (isDuplicateEmail(email)) {
        showError("이미 등록된 이메일이에요. 곧 소식을 전해드릴게요!", true);
        trackEvent("email_signup_error", { reason: "duplicate", form_id: form.id });
        return;
      }

      setLoading(true);

      // 실제 백엔드 연동 전까지는 짧은 지연으로 제출 흐름을 모사한다.
      window.setTimeout(function () {
        setLoading(false);
        storeEmail(email);
        showSuccess();
        trackEvent("email_signup_submit", { form_id: form.id });
      }, 400);
    });

    input.addEventListener("input", function () {
      if (errorEl.textContent) clearError();
    });
  }

  /* ---------------------------------------------------------
     Hero 섹션: CTA 버튼 클릭 시 인라인 이메일 폼으로 전환
  --------------------------------------------------------- */
  function setupHeroCtaToggle() {
    const ctaArea = document.querySelector(".section-hero__cta-area");
    if (!ctaArea) return;

    const ctaBtn = ctaArea.querySelector(".section-hero__cta-btn");
    const form = ctaArea.querySelector("#hero-email-form");
    if (!ctaBtn || !form) return;

    ctaBtn.addEventListener("click", function () {
      ctaArea.setAttribute("data-cta-state", "form");
      ctaBtn.hidden = true;
      form.hidden = false;
      const input = form.querySelector(".email-form__input");
      if (input) input.focus();
      trackEvent("hero_cta_click", {});
    });
  }

  /* ---------------------------------------------------------
     FAQ 아코디언 (다중 오픈 허용)
  --------------------------------------------------------- */
  function setupFaqAccordion() {
    const questions = document.querySelectorAll(".faq-item__question");
    questions.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = btn.closest(".faq-item");
        const answer = document.getElementById(btn.getAttribute("aria-controls"));
        const isOpen = btn.getAttribute("aria-expanded") === "true";

        if (isOpen) {
          btn.setAttribute("aria-expanded", "false");
          if (item) item.classList.remove("is-open");
          if (answer) {
            answer.style.maxHeight = answer.scrollHeight + "px";
            // 강제 리플로우 후 0으로 트랜지션
            requestAnimationFrame(function () {
              answer.style.maxHeight = "0px";
            });
          }
        } else {
          btn.setAttribute("aria-expanded", "true");
          if (item) item.classList.add("is-open");
          if (answer) {
            answer.hidden = false;
            answer.style.maxHeight = answer.scrollHeight + "px";
          }
          trackEvent("faq_item_open", { question_id: btn.id });
        }

        if (answer) {
          answer.addEventListener(
            "transitionend",
            function handler() {
              if (btn.getAttribute("aria-expanded") === "false") {
                answer.hidden = true;
              }
              answer.removeEventListener("transitionend", handler);
            },
            { once: true }
          );
        }
      });
    });
  }

  /* ---------------------------------------------------------
     data-ga-event 속성이 붙은 모든 클릭 가능 요소 트래킹
     (폼 submit 버튼처럼 이미 개별 로직에서 트래킹하는 요소는
     이벤트 성격이 다르므로 여기서는 클릭 즉시 이벤트를 보낸다.
     이미 위에서 개별 처리한 hero_cta_click, faq_item_open, 이메일 폼
     제출 이벤트는 중복 전송을 피하기 위해 제외한다.)
  --------------------------------------------------------- */
  function setupGenericGaClickTracking() {
    const EXCLUDED = ["faq_item_open"]; // FAQ는 setupFaqAccordion에서 개별 처리

    document.addEventListener("click", function (event) {
      const target = event.target.closest("[data-ga-event]");
      if (!target) return;

      const eventName = target.getAttribute("data-ga-event");
      if (!eventName || EXCLUDED.indexOf(eventName) !== -1) return;

      // hero_cta_click은 setupHeroCtaToggle에서 이미 트래킹하므로 스킵
      if (eventName === "hero_cta_click") return;

      // final_cta_click은 submit 버튼에 달려 있어 클릭 시 즉시 전송(폼 제출 성공 여부와 무관하게 클릭 자체를 기록)
      trackEvent(eventName, {});
    });
  }

  /* ---------------------------------------------------------
     요금제 월/연 토글 (존재할 경우에만 연결)
  --------------------------------------------------------- */
  function setupPricingToggle() {
    const toggle = document.querySelector("[data-pricing-toggle]");
    if (!toggle) return;

    toggle.addEventListener("click", function () {
      trackEvent("pricing_toggle_view", {});
    });
  }

  /* ---------------------------------------------------------
     IntersectionObserver 기반 섹션 뷰 트래킹
     각 section이 50% 이상 뷰포트에 들어오면 section_view_{id} 이벤트를
     섹션당 최초 1회만 발생시킨다.
  --------------------------------------------------------- */
  function setupSectionViewTracking() {
    const sections = document.querySelectorAll("main section[id]");
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const seen = new Set();

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !seen.has(entry.target.id)) {
            seen.add(entry.target.id);
            trackEvent("section_view_" + entry.target.id, {});
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ---------------------------------------------------------
     초기화
  --------------------------------------------------------- */
  function init() {
    setupEmailForm(document.getElementById("hero-email-form"));
    setupEmailForm(document.getElementById("final-email-form"));
    setupHeroCtaToggle();
    setupFaqAccordion();
    setupGenericGaClickTracking();
    setupPricingToggle();
    setupSectionViewTracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
