import gsap from "gsap"

const BASE = { force3D: true, overwrite: "auto" as const }

export function motionEnabled(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function fadeSlideIn(
  target: gsap.TweenTarget,
  options?: { y?: number; duration?: number; delay?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { y = 6, duration = 0.28, delay = 0, onComplete } = options ?? {}
  if (!motionEnabled()) {
    return gsap.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0, ease: "power2.out", onComplete })
  }
  return gsap.fromTo(
    target,
    { autoAlpha: 0, transform: `translate3d(0, ${y}px, 0) scale(0.98)` },
    { autoAlpha: 1, transform: "translate3d(0, 0, 0) scale(1)", duration, delay, ease: "power3.out", clearProps: "transform", onComplete, ...BASE },
  )
}

export function fadeSlideOut(
  target: gsap.TweenTarget,
  options?: { y?: number; duration?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { y = -4, duration = 0.18, onComplete } = options ?? {}
  if (!motionEnabled()) {
    return gsap.to(target, { autoAlpha: 0, duration: 0, ease: "power2.out", onComplete })
  }
  return gsap.to(target, { autoAlpha: 0, transform: `translate3d(0, ${y}px, 0) scale(0.98)`, duration, ease: "power3.out", onComplete, ...BASE })
}

export function scaleFadeIn(
  target: gsap.TweenTarget,
  options?: { duration?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { duration = 0.32, onComplete } = options ?? {}
  if (!motionEnabled()) {
    return gsap.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0, ease: "power2.out", onComplete })
  }
  return gsap.fromTo(
    target,
    { autoAlpha: 0, transform: "scale(0.98)" },
    { autoAlpha: 1, transform: "scale(1)", duration, ease: "power3.out", clearProps: "transform", onComplete, ...BASE },
  )
}

export function scaleFadeOut(
  target: gsap.TweenTarget,
  options?: { duration?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { duration = 0.18, onComplete } = options ?? {}
  if (!motionEnabled()) {
    return gsap.to(target, { autoAlpha: 0, duration: 0, ease: "power2.out", onComplete })
  }
  return gsap.to(target, { autoAlpha: 0, transform: "scale(0.98)", duration, ease: "power3.out", onComplete, ...BASE })
}

export function staggerIn(
  targets: gsap.TweenTarget,
  options?: { y?: number; stagger?: number; duration?: number; maxItems?: number },
): gsap.core.Tween {
  const { y = 6, stagger = 0.035, duration = 0.28, maxItems = 6 } = options ?? {}
  const items = gsap.utils.toArray(targets)
  if (items.length === 0) {
    return gsap.set([], {})
  }
  if (!motionEnabled()) {
    return gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0, stagger: 0, ease: "power2.out" })
  }
  const animated = items.slice(0, maxItems)
  if (items.length > maxItems) {
    gsap.set(items.slice(maxItems), { autoAlpha: 1, clearProps: "transform" })
  }
  return gsap.fromTo(
    animated,
    { autoAlpha: 0, transform: `translate3d(0, ${y}px, 0) scale(0.98)` },
    { autoAlpha: 1, transform: "translate3d(0, 0, 0) scale(1)", duration, stagger, ease: "power3.out", clearProps: "transform", ...BASE },
  )
}

export type CardLeaveVariant = "dislike" | "want-watch" | "default"

export function captureCardRects(
  container: HTMLElement,
  exclude?: HTMLElement,
): Map<HTMLElement, DOMRect> {
  const rects = new Map<HTMLElement, DOMRect>()
  container.querySelectorAll<HTMLElement>(".video-card").forEach((el) => {
    if (exclude && el === exclude) {
      return
    }
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    // Animating off-screen cards wastes compositor work and is the main source
    // of jank on long inbox pages.
    if (rect.bottom < -40 || rect.top > window.innerHeight + 40) return
    if (rects.size >= 12) return
    rects.set(el, rect)
  })
  return rects
}

export function animateGridReflow(
  container: HTMLElement,
  beforeRects: Map<HTMLElement, DOMRect>,
  onComplete?: () => void,
): void {
  if (!motionEnabled() || beforeRects.size === 0) {
    onComplete?.()
    return
  }

  const timeline = gsap.timeline({
    onComplete: () => {
      beforeRects.forEach((_rect, el) => el.classList.remove("is-flip-animating"))
      onComplete?.()
    },
  })
  let hasTween = false

  beforeRects.forEach((oldRect, el) => {
    if (!container.contains(el)) {
      return
    }
    const newRect = el.getBoundingClientRect()
    const dx = oldRect.left - newRect.left
    const dy = oldRect.top - newRect.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      return
    }
    hasTween = true
    el.classList.add("is-flip-animating")
    timeline.fromTo(
      el,
      { transform: `translate3d(${dx}px, ${dy}px, 0)`, willChange: "transform" },
      {
        transform: "translate3d(0, 0, 0)",
        duration: 0.2,
        ease: "power3.out",
        clearProps: "transform,willChange",
        onComplete: () => el.classList.remove("is-flip-animating"),
        ...BASE,
      },
      0,
    )
  })

  if (!hasTween) {
    onComplete?.()
  }
}

export function resetCardLeaveStyles(el: HTMLElement): void {
  el.classList.remove("video-card--leaving")
  el.style.willChange = ""
  el.style.pointerEvents = ""
  gsap.set(el, { clearProps: "all" })
}

export function pulseActive(target: gsap.TweenTarget): void {
  if (!motionEnabled()) {
    return
  }
  gsap.fromTo(target, { transform: "scale(0.98)" }, { transform: "scale(1)", duration: 0.14, ease: "power3.out", clearProps: "transform", ...BASE })
}

export function maskFadeIn(
  target: gsap.TweenTarget,
  options?: { duration?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { duration = 0.18, onComplete } = options ?? {}
  if (!motionEnabled()) {
    return gsap.set(target, { autoAlpha: 1, onComplete })
  }
  return gsap.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration, ease: "power1.out", onComplete, ...BASE })
}

export function maskFadeOut(
  target: gsap.TweenTarget,
  options?: { duration?: number; onComplete?: () => void },
): gsap.core.Tween {
  const { duration = 0.16, onComplete } = options ?? {}
  if (!motionEnabled()) {
    onComplete?.()
    return gsap.set(target, { autoAlpha: 0 })
  }
  return gsap.to(target, { autoAlpha: 0, duration, ease: "power2.out", onComplete, ...BASE })
}
