import {
  AlignCenterHorizontalSimpleIcon,
  AlignLeftSimpleIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CopyIcon,
  CursorIcon,
  MinusIcon,
  PencilSimpleIcon,
  PlusIcon,
  SelectionIcon,
  SquareIcon,
  StackSimpleIcon,
  TextBIcon,
  TextTIcon,
  TrashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Moveable from "react-moveable";
import type {
  OnDrag,
  OnDragEnd,
  OnDragGroup,
  OnDragGroupEnd,
  OnDragGroupStart,
  OnDragStart,
  OnResize,
  OnResizeEnd,
  OnResizeGroup,
  OnResizeGroupEnd,
  OnRotate,
  OnRotateEnd,
  OnRotateGroup,
  OnRotateGroupEnd,
  OnRotateGroupStart,
  OnRotateStart,
} from "react-moveable";
import Selecto from "react-selecto";

import { Button } from "~/components/ui/button";
import { ButtonGroup } from "~/components/ui/button-group";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { cn } from "~/lib/utils";

interface SelectionMeta {
  fontSize: number;
  isBold: boolean;
  isOverlayRoot: boolean;
  tag: string;
  textAlign: string;
}

interface InteractiveAnnouncementCanvasProps {
  backgroundUrl: string | null;
  canRedo?: boolean;
  canUndo?: boolean;
  className?: string;
  html: string;
  onHtmlChange: (html: string) => void;
  onRedo?: () => void;
  onUndo?: () => void;
}

const MIN_ELEMENT_SIZE = 24;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 200;
const FONT_SIZE_STEP = 4;
const NUDGE_STEP_PX = 8;

const isHtmlElement = (node: EventTarget | null): node is HTMLElement =>
  node instanceof HTMLElement;

const getOverlayRoot = (host: HTMLElement): HTMLElement | null => {
  const overlay = host.firstElementChild;
  return overlay instanceof HTMLElement ? overlay : null;
};

const isOverlayRootElement = (
  element: HTMLElement,
  host: HTMLElement
): boolean => element === host || element === getOverlayRoot(host);

const listSelectableElements = (host: HTMLElement | null): HTMLElement[] => {
  if (!host) {
    return [];
  }

  const overlay = getOverlayRoot(host);

  if (!overlay) {
    return [];
  }

  return [...overlay.querySelectorAll("*")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
};

interface ElementFrame {
  rotate: number;
  translate: [number, number];
}

const getElementFrame = (
  frames: WeakMap<HTMLElement, ElementFrame>,
  element: HTMLElement
): ElementFrame => {
  const existing = frames.get(element);

  if (existing) {
    return existing;
  }

  const frame: ElementFrame = { rotate: 0, translate: [0, 0] };
  frames.set(element, frame);
  return frame;
};

const applyElementFrameTransform = (
  frames: WeakMap<HTMLElement, ElementFrame>,
  element: HTMLElement
): void => {
  const frame = getElementFrame(frames, element);
  const [x, y] = frame.translate;
  const transforms: string[] = [];

  if (x !== 0 || y !== 0) {
    transforms.push(`translate(${x}px, ${y}px)`);
  }

  if (frame.rotate !== 0) {
    transforms.push(`rotate(${frame.rotate}deg)`);
  }

  // Only touch transform when we own frame state — avoid clearing author transforms
  // on a no-op (0,0) if the element was never moved by the editor.
  if (transforms.length > 0) {
    element.style.transform = transforms.join(" ");
  } else if (frames.has(element)) {
    const hasEditorTransform =
      element.style.transform.includes("translate") ||
      element.style.transform.includes("rotate");

    if (hasEditorTransform || frame.rotate !== 0) {
      element.style.transform = "";
    }
  }
};

/**
 * Map the element's current painted box into absolute CSS coords relative to
 * `overlay`, then FLIP-correct any residual pixel drift. Used only when baking
 * a completed drag/resize — never on mere selection.
 */
const bakeVisualBoxToAbsolute = (
  frames: WeakMap<HTMLElement, ElementFrame>,
  element: HTMLElement,
  overlay: HTMLElement
): void => {
  const computed = window.getComputedStyle(overlay);

  if (computed.position === "static") {
    overlay.style.position = "relative";
  }

  const before = element.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const scaleX =
    overlayRect.width === 0 ? 1 : overlay.offsetWidth / overlayRect.width;
  const scaleY =
    overlayRect.height === 0 ? 1 : overlay.offsetHeight / overlayRect.height;

  // Absolute CB is the padding edge of the overlay.
  let left =
    (before.left - overlayRect.left - overlay.clientLeft) * scaleX +
    overlay.scrollLeft;
  let top =
    (before.top - overlayRect.top - overlay.clientTop) * scaleY +
    overlay.scrollTop;
  const width = before.width * scaleX;
  const height = before.height * scaleY;

  const frame = getElementFrame(frames, element);
  frame.translate = [0, 0];

  element.style.position = "absolute";
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.margin = "0";
  element.style.right = "auto";
  element.style.bottom = "auto";
  applyElementFrameTransform(frames, element);

  // FLIP: correct any drift introduced by leaving the flex formatting context.
  const after = element.getBoundingClientRect();
  const dx = (before.left - after.left) * scaleX;
  const dy = (before.top - after.top) * scaleY;

  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    left += dx;
    top += dy;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  element.style.left = `${Math.round(Number.parseFloat(element.style.left) || 0)}px`;
  element.style.top = `${Math.round(Number.parseFloat(element.style.top) || 0)}px`;
  element.style.width = `${Math.round(width)}px`;
  element.style.height = `${Math.round(height)}px`;
};

/** True when the pointer that ended Selecto is still held (continuing into Moveable). */
const isPointerStillDown = (inputEvent: Event): boolean => {
  if (
    typeof PointerEvent !== "undefined" &&
    inputEvent instanceof PointerEvent
  ) {
    return inputEvent.buttons > 0;
  }

  if (inputEvent instanceof MouseEvent) {
    return inputEvent.buttons > 0;
  }

  if (typeof TouchEvent !== "undefined" && inputEvent instanceof TouchEvent) {
    return inputEvent.touches.length > 0;
  }

  return false;
};

const readSelectionMeta = (
  element: HTMLElement,
  host: HTMLElement
): SelectionMeta => {
  const computed = window.getComputedStyle(element);
  const weight = computed.fontWeight;
  const numericWeight = Number.parseInt(weight, 10);
  const isBold =
    weight === "bold" || (!Number.isNaN(numericWeight) && numericWeight >= 600);

  return {
    fontSize: Math.round(Number.parseFloat(computed.fontSize) || 16),
    isBold,
    isOverlayRoot: isOverlayRootElement(element, host),
    tag: element.tagName.toLowerCase(),
    textAlign: computed.textAlign || "start",
  };
};

const serializeHost = (host: HTMLElement): string => {
  for (const el of host.querySelectorAll("[contenteditable]")) {
    el.removeAttribute("contenteditable");
  }

  return host.innerHTML;
};

const newHeadingHtml = (left: number, top: number): string =>
  `<h1 style="position:absolute;left:${left}px;top:${top}px;margin:0;font-size:96px;line-height:1.05;font-weight:700;color:#ffffff;text-shadow:0 4px 24px rgba(0,0,0,0.45);">New heading</h1>`;

const newTextBlockHtml = (left: number, top: number): string =>
  `<p style="position:absolute;left:${left}px;top:${top}px;margin:0;font-size:42px;line-height:1.2;color:#ffffff;text-shadow:0 2px 12px rgba(0,0,0,0.45);">New text</p>`;

const newDivBlockHtml = (left: number, top: number): string =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:320px;min-height:120px;box-sizing:border-box;padding:24px;border:2px dashed rgba(255,255,255,0.45);border-radius:12px;color:#ffffff;font-size:28px;line-height:1.3;">New block</div>`;

const ToolbarSection = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
      {label}
    </span>
    <div className="flex flex-wrap items-center gap-1.5">{children}</div>
  </div>
);

// Moveable/Selecto surface with a large interaction surface — complexity is inherent.
// oxlint-disable-next-line eslint/complexity -- canvas editor orchestration
export const InteractiveAnnouncementCanvas = ({
  backgroundUrl,
  canRedo = false,
  canUndo = false,
  className,
  html,
  onHtmlChange,
  onRedo,
  onUndo,
}: InteractiveAnnouncementCanvasProps) => {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const selectoRef = useRef<Selecto>(null);
  const targetsRef = useRef<HTMLElement[]>([]);
  const framesRef = useRef(new WeakMap<HTMLElement, ElementFrame>());
  const isEditingTextRef = useRef(false);
  const syncedHtmlRef = useRef(html);
  const suppressExternalSyncRef = useRef(false);

  const [previewScale, setPreviewScale] = useState(1);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [selectionMeta, setSelectionMeta] = useState<SelectionMeta | null>(
    null
  );
  const [isEditingText, setIsEditingText] = useState(false);
  const [fontSizeDraft, setFontSizeDraft] = useState("");
  const [containerReady, setContainerReady] = useState(false);

  const scaledWidth = ANNOUNCEMENT_WIDTH * previewScale;
  const scaledHeight = ANNOUNCEMENT_HEIGHT * previewScale;

  targetsRef.current = targets;

  const [primaryTarget = null] = targets;
  const hasSelection = targets.length > 0;
  const canMutateSelection =
    hasSelection &&
    selectionMeta !== null &&
    !selectionMeta.isOverlayRoot &&
    targets.every((target) => {
      const host = hostRef.current;
      return host ? !isOverlayRootElement(target, host) : false;
    });

  const refreshSelectionMeta = useCallback((nextTargets: HTMLElement[]) => {
    const host = hostRef.current;
    const [primary] = nextTargets;

    if (!(host && primary && host.contains(primary))) {
      setSelectionMeta(null);
      setFontSizeDraft("");
      return;
    }

    const meta = readSelectionMeta(primary, host);
    setSelectionMeta(meta);
    setFontSizeDraft(String(meta.fontSize));
  }, []);

  const setSelection = useCallback(
    (nextTargets: HTMLElement[]) => {
      const host = hostRef.current;
      // Selection must not mutate layout — first-click snap came from pinning
      // flex children to absolute here with incorrect offsets.
      const valid = nextTargets.filter(
        (el) => host?.contains(el) && el.isConnected
      );

      setTargets(valid);
      refreshSelectionMeta(valid);
      requestAnimationFrame(() => {
        moveableRef.current?.updateRect();
      });
    },
    [refreshSelectionMeta]
  );

  const clearSelection = useCallback(() => {
    setSelection([]);
  }, [setSelection]);

  const commitHtml = useCallback(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const next = serializeHost(host);

    if (next === syncedHtmlRef.current) {
      refreshSelectionMeta(targetsRef.current);
      moveableRef.current?.updateRect();
      return;
    }

    syncedHtmlRef.current = next;
    suppressExternalSyncRef.current = true;
    onHtmlChange(next);
    refreshSelectionMeta(targetsRef.current);
    requestAnimationFrame(() => {
      moveableRef.current?.updateRect();
    });
  }, [onHtmlChange, refreshSelectionMeta]);

  const withTargets = useCallback(
    (action: (elements: HTMLElement[], host: HTMLElement) => void) => {
      const host = hostRef.current;
      const elements = targetsRef.current.filter(
        (el) => host?.contains(el) && el.isConnected
      );

      if (!(host && elements.length > 0)) {
        return;
      }

      action(elements, host);
      commitHtml();
    },
    [commitHtml]
  );

  // Keep host DOM in sync when HTML changes from the code editor (or AI gen).
  useLayoutEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    if (suppressExternalSyncRef.current) {
      suppressExternalSyncRef.current = false;
      syncedHtmlRef.current = html;
      return;
    }

    if (html === syncedHtmlRef.current && host.innerHTML === html) {
      return;
    }

    if (isEditingTextRef.current) {
      return;
    }

    host.innerHTML = html;
    syncedHtmlRef.current = html;
    clearSelection();
  }, [clearSelection, html]);

  useEffect(() => {
    setContainerReady(true);
  }, []);

  // Fit the 1920×1080 stage inside the container on both axes (contain).
  useEffect(() => {
    const container = previewContainerRef.current;

    if (!container) {
      return;
    }

    const updateScale = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      const nextScale = Math.min(
        width / ANNOUNCEMENT_WIDTH,
        height / ANNOUNCEMENT_HEIGHT
      );

      setPreviewScale(nextScale);
    };

    updateScale(container.clientWidth, container.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;

      if (!entry) {
        return;
      }

      updateScale(entry.contentRect.width, entry.contentRect.height);
      moveableRef.current?.updateRect();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const finishTextEdit = useCallback(() => {
    for (const target of targetsRef.current) {
      target.removeAttribute("contenteditable");
    }

    isEditingTextRef.current = false;
    setIsEditingText(false);
    commitHtml();
  }, [commitHtml]);

  const startTextEdit = useCallback(
    (element: HTMLElement) => {
      const host = hostRef.current;

      if (!host || isOverlayRootElement(element, host)) {
        return;
      }

      setSelection([element]);
      isEditingTextRef.current = true;
      setIsEditingText(true);
      element.contentEditable = "true";
      element.focus();

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    [setSelection]
  );

  const deleteSelected = useCallback(() => {
    withTargets((elements, host) => {
      for (const element of elements) {
        if (!isOverlayRootElement(element, host)) {
          element.remove();
        }
      }

      clearSelection();
    });
  }, [clearSelection, withTargets]);

  const selectParent = useCallback(() => {
    const host = hostRef.current;
    const [primary] = targetsRef.current;
    const overlay = host ? getOverlayRoot(host) : null;
    const parent = primary?.parentElement;

    if (
      primary &&
      overlay &&
      primary !== overlay &&
      overlay.contains(primary) &&
      parent instanceof HTMLElement &&
      host?.contains(parent)
    ) {
      setSelection([parent]);
      return;
    }

    clearSelection();
  }, [clearSelection, setSelection]);

  useEffect(() => {
    const isTypingInField = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const { tagName, isContentEditable } = target;
      return tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable;
    };

    const nudgeFromKeyboard = (key: string, shiftKey: boolean) => {
      const host = hostRef.current;
      const overlay = host ? getOverlayRoot(host) : null;
      const elements = targetsRef.current;

      if (!(host && overlay && elements.length > 0)) {
        return;
      }

      const step = shiftKey ? NUDGE_STEP_PX * 4 : NUDGE_STEP_PX;
      const delta: Record<string, { left: number; top: number }> = {
        ArrowDown: { left: 0, top: step },
        ArrowLeft: { left: -step, top: 0 },
        ArrowRight: { left: step, top: 0 },
        ArrowUp: { left: 0, top: -step },
      };
      const offset = delta[key];

      if (!offset) {
        return;
      }

      for (const element of elements) {
        if (isOverlayRootElement(element, host)) {
          continue;
        }

        bakeVisualBoxToAbsolute(framesRef.current, element, overlay);
        const left = Number.parseFloat(element.style.left) || 0;
        const top = Number.parseFloat(element.style.top) || 0;
        element.style.left = `${left + offset.left}px`;
        element.style.top = `${top + offset.top}px`;
      }

      commitHtml();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditingTextRef.current) {
        if (event.key === "Escape") {
          event.preventDefault();
          finishTextEdit();
        }

        return;
      }

      if (isTypingInField(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        selectParent();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        targetsRef.current.length > 0
      ) {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (
        targetsRef.current.length > 0 &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        nudgeFromKeyboard(event.key, event.shiftKey);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [commitHtml, deleteSelected, finishTextEdit, selectParent]);

  const bakeTarget = (target: HTMLElement) => {
    const host = hostRef.current;
    const overlay = host ? getOverlayRoot(host) : null;

    if (!overlay) {
      return;
    }

    bakeVisualBoxToAbsolute(framesRef.current, target, overlay);
  };

  const resetTargetTranslate = (target: HTMLElement) => {
    const frame = getElementFrame(framesRef.current, target);
    frame.translate = [0, 0];
    applyElementFrameTransform(framesRef.current, target);
  };

  const onDragStart = ({ set, target }: OnDragStart) => {
    // Keep flex/static layout during drag — move with translate only so the
    // first interaction never rewrites left/top mid-gesture.
    if (target instanceof HTMLElement) {
      const frame = getElementFrame(framesRef.current, target);
      frame.translate = [0, 0];
    }

    set([0, 0]);
  };

  const onDrag = ({ beforeTranslate, target }: OnDrag) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const frame = getElementFrame(framesRef.current, target);
    frame.translate = [beforeTranslate[0], beforeTranslate[1]];
    applyElementFrameTransform(framesRef.current, target);
  };

  const onDragGroupStart = ({ events }: OnDragGroupStart) => {
    for (const ev of events) {
      if (ev.target instanceof HTMLElement) {
        const frame = getElementFrame(framesRef.current, ev.target);
        frame.translate = [0, 0];
      }

      ev.set([0, 0]);
    }
  };

  const onDragGroup = ({ events }: OnDragGroup) => {
    for (const ev of events) {
      onDrag(ev);
    }
  };

  const onDragEnd = ({ isDrag, target }: OnDragEnd) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!isDrag) {
      resetTargetTranslate(target);
      moveableRef.current?.updateRect();
      return;
    }

    bakeTarget(target);
    commitHtml();
  };

  const onDragGroupEnd = ({
    isDrag,
    targets: groupTargets,
  }: OnDragGroupEnd) => {
    for (const target of groupTargets) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      if (isDrag) {
        bakeTarget(target);
      } else {
        resetTargetTranslate(target);
      }
    }

    if (isDrag) {
      commitHtml();
    } else {
      moveableRef.current?.updateRect();
    }
  };

  const onResizeStart = ({
    setMin,
    target,
  }: {
    setMin: (min: number[]) => void;
    target: HTMLElement | SVGElement;
  }) => {
    // Resize needs a concrete box; bake current visual → absolute once at start.
    if (target instanceof HTMLElement) {
      bakeTarget(target);
      const frame = getElementFrame(framesRef.current, target);
      frame.translate = [0, 0];
    }

    setMin([MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE]);
    moveableRef.current?.updateRect();
  };

  const onResize = ({ drag, height, target, width }: OnResize) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const frame = getElementFrame(framesRef.current, target);
    target.style.width = `${Math.round(width)}px`;
    target.style.height = `${Math.round(height)}px`;
    frame.translate = [drag.beforeTranslate[0], drag.beforeTranslate[1]];
    applyElementFrameTransform(framesRef.current, target);
  };

  const onResizeGroup = ({ events }: OnResizeGroup) => {
    for (const ev of events) {
      onResize(ev);
    }
  };

  const onResizeGroupStart = ({
    events,
  }: {
    events: { target: HTMLElement | SVGElement }[];
  }) => {
    for (const ev of events) {
      if (ev.target instanceof HTMLElement) {
        bakeTarget(ev.target);
        const frame = getElementFrame(framesRef.current, ev.target);
        frame.translate = [0, 0];
      }
    }

    moveableRef.current?.updateRect();
  };

  const onResizeEnd = ({ isDrag, target }: OnResizeEnd) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!isDrag) {
      resetTargetTranslate(target);
      moveableRef.current?.updateRect();
      return;
    }

    bakeTarget(target);
    commitHtml();
  };

  const onResizeGroupEnd = ({
    isDrag,
    targets: groupTargets,
  }: OnResizeGroupEnd) => {
    for (const target of groupTargets) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      if (isDrag) {
        bakeTarget(target);
      } else {
        resetTargetTranslate(target);
      }
    }

    if (isDrag) {
      commitHtml();
    } else {
      moveableRef.current?.updateRect();
    }
  };

  const onRotateStart = ({ set, target }: OnRotateStart) => {
    if (target instanceof HTMLElement) {
      const frame = getElementFrame(framesRef.current, target);
      set(frame.rotate);
      return;
    }

    set(0);
  };

  const onRotate = ({ beforeRotation, target }: OnRotate) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const frame = getElementFrame(framesRef.current, target);
    frame.rotate = beforeRotation;
    applyElementFrameTransform(framesRef.current, target);
  };

  const onRotateGroupStart = ({ events }: OnRotateGroupStart) => {
    for (const ev of events) {
      if (ev.target instanceof HTMLElement) {
        const frame = getElementFrame(framesRef.current, ev.target);
        ev.set(frame.rotate);
      } else {
        ev.set(0);
      }
    }
  };

  const onRotateGroup = ({ events }: OnRotateGroup) => {
    for (const ev of events) {
      onRotate(ev);
    }
  };

  const onRotateEnd = ({ isDrag }: OnRotateEnd) => {
    if (isDrag) {
      commitHtml();
    } else {
      moveableRef.current?.updateRect();
    }
  };

  const onRotateGroupEnd = ({ isDrag }: OnRotateGroupEnd) => {
    if (isDrag) {
      commitHtml();
    } else {
      moveableRef.current?.updateRect();
    }
  };

  const onHostDoubleClick = (event: React.MouseEvent) => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let node: HTMLElement | null = isHtmlElement(event.target)
      ? event.target
      : null;

    while (node && node !== host) {
      if (!isOverlayRootElement(node, host) && host.contains(node)) {
        event.preventDefault();
        event.stopPropagation();
        startTextEdit(node);
        return;
      }

      node = node.parentElement;
    }
  };

  const onHostBlur = (event: React.FocusEvent) => {
    if (!isEditingTextRef.current) {
      return;
    }

    const related = event.relatedTarget;

    if (
      related instanceof Node &&
      targetsRef.current.some((target) => target.contains(related))
    ) {
      return;
    }

    finishTextEdit();
  };

  const ensureOverlay = (): HTMLElement | null => {
    const host = hostRef.current;

    if (!host) {
      return null;
    }

    let overlay = getOverlayRoot(host);

    if (!overlay) {
      host.innerHTML = `<div class="announcement-overlay" style="box-sizing:border-box;width:${ANNOUNCEMENT_WIDTH}px;height:${ANNOUNCEMENT_HEIGHT}px;position:relative;"></div>`;
      overlay = getOverlayRoot(host);
    }

    return overlay;
  };

  const insertMarkup = (markup: string) => {
    const overlay = ensureOverlay();

    if (!overlay) {
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    const node = template.content.firstElementChild;

    if (!(node instanceof HTMLElement)) {
      return;
    }

    // oxlint-disable-next-line unicorn/prefer-dom-node-append -- workers DOM typings
    overlay.appendChild(node);
    setSelection([node]);
    commitHtml();
  };

  const onAddHeading = () => {
    insertMarkup(
      newHeadingHtml(
        Math.round(ANNOUNCEMENT_WIDTH * 0.1),
        Math.round(ANNOUNCEMENT_HEIGHT * 0.28)
      )
    );
  };

  const onAddText = () => {
    insertMarkup(
      newTextBlockHtml(
        Math.round(ANNOUNCEMENT_WIDTH * 0.12),
        Math.round(ANNOUNCEMENT_HEIGHT * 0.45)
      )
    );
  };

  const onAddDiv = () => {
    insertMarkup(
      newDivBlockHtml(
        Math.round(ANNOUNCEMENT_WIDTH * 0.15),
        Math.round(ANNOUNCEMENT_HEIGHT * 0.3)
      )
    );
  };

  const onEditText = () => {
    if (!primaryTarget || !canMutateSelection) {
      return;
    }

    startTextEdit(primaryTarget);
  };

  const applyFontSize = (size: number) => {
    const next = Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(size))
    );

    withTargets((elements) => {
      for (const element of elements) {
        element.style.fontSize = `${next}px`;
      }
    });
  };

  const onFontSizeStep = (delta: number) => {
    const current = selectionMeta?.fontSize ?? 42;
    applyFontSize(current + delta);
  };

  const onFontSizeInputCommit = () => {
    const parsed = Number.parseInt(fontSizeDraft, 10);

    if (Number.isNaN(parsed)) {
      refreshSelectionMeta(targetsRef.current);
      return;
    }

    applyFontSize(parsed);
  };

  const onToggleBold = () => {
    withTargets((elements, host) => {
      for (const element of elements) {
        const meta = readSelectionMeta(element, host);
        element.style.fontWeight = meta.isBold ? "400" : "700";
      }
    });
  };

  const onTextAlign = (align: "left" | "center") => {
    withTargets((elements) => {
      for (const element of elements) {
        element.style.textAlign = align;
      }
    });
  };

  const onNudge = (axis: "x" | "y", amount: number) => {
    withTargets((elements, host) => {
      const overlay = getOverlayRoot(host);

      if (!overlay) {
        return;
      }

      for (const element of elements) {
        if (isOverlayRootElement(element, host)) {
          continue;
        }

        bakeVisualBoxToAbsolute(framesRef.current, element, overlay);
        const left = Number.parseFloat(element.style.left) || 0;
        const top = Number.parseFloat(element.style.top) || 0;

        if (axis === "x") {
          element.style.left = `${left + amount}px`;
        } else {
          element.style.top = `${top + amount}px`;
        }
      }
    });
  };

  const onBringForward = () => {
    withTargets((elements) => {
      for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];

        if (!element) {
          continue;
        }

        const parent = element.parentNode;
        const next = element.nextElementSibling;

        if (!(parent && next instanceof HTMLElement)) {
          continue;
        }

        // oxlint-disable-next-line unicorn/prefer-modern-dom-apis -- workers DOM typings
        parent.insertBefore(next, element);
      }
    });
  };

  const onSendBackward = () => {
    withTargets((elements) => {
      for (const element of elements) {
        const parent = element.parentNode;
        const prev = element.previousElementSibling;

        if (!(parent && prev instanceof HTMLElement)) {
          continue;
        }

        // oxlint-disable-next-line unicorn/prefer-modern-dom-apis -- workers DOM typings
        parent.insertBefore(element, prev);
      }
    });
  };

  const onDuplicate = () => {
    withTargets((elements, host) => {
      const overlay = getOverlayRoot(host);

      if (!overlay) {
        return;
      }

      const clones: HTMLElement[] = [];

      for (const element of elements) {
        if (isOverlayRootElement(element, host)) {
          continue;
        }

        const clone = element.cloneNode(true);

        if (!(clone instanceof HTMLElement)) {
          continue;
        }

        bakeVisualBoxToAbsolute(framesRef.current, element, overlay);
        const left = Number.parseFloat(element.style.left) || 0;
        const top = Number.parseFloat(element.style.top) || 0;
        clone.style.position = "absolute";
        clone.style.left = `${left + 24}px`;
        clone.style.top = `${top + 24}px`;
        clone.style.width = element.style.width;
        clone.style.height = element.style.height;
        // oxlint-disable-next-line unicorn/prefer-dom-node-append -- workers DOM typings
        overlay.appendChild(clone);
        clones.push(clone);
      }

      if (clones.length > 0) {
        targetsRef.current = clones;
        setTargets(clones);
        refreshSelectionMeta(clones);
      }
    });
  };

  const alignIs = (value: "left" | "center") => {
    if (!selectionMeta) {
      return false;
    }

    if (value === "left") {
      return (
        selectionMeta.textAlign === "left" ||
        selectionMeta.textAlign === "start"
      );
    }

    return selectionMeta.textAlign === "center";
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="bg-card flex shrink-0 flex-col gap-3 rounded-xl border p-3">
        <div className="flex flex-wrap items-start gap-4">
          <ToolbarSection label="History">
            <ButtonGroup>
              <Button
                disabled={!canUndo || !onUndo}
                onClick={onUndo}
                size="sm"
                title="Undo (Mod+Z)"
                type="button"
                variant="outline"
              >
                <ArrowCounterClockwiseIcon data-icon="inline-start" />
                Undo
              </Button>
              <Button
                disabled={!canRedo || !onRedo}
                onClick={onRedo}
                size="sm"
                title="Redo (Mod+Y)"
                type="button"
                variant="outline"
              >
                <ArrowClockwiseIcon data-icon="inline-start" />
                Redo
              </Button>
            </ButtonGroup>
          </ToolbarSection>

          <Separator
            className="hidden h-auto self-stretch sm:block"
            orientation="vertical"
          />

          <ToolbarSection label="Add">
            <ButtonGroup>
              <Button
                onClick={onAddHeading}
                size="sm"
                title="Add heading"
                type="button"
                variant="outline"
              >
                <TextTIcon data-icon="inline-start" />
                Heading
              </Button>
              <Button
                onClick={onAddText}
                size="sm"
                title="Add text"
                type="button"
                variant="outline"
              >
                <PencilSimpleIcon data-icon="inline-start" />
                Text
              </Button>
              <Button
                onClick={onAddDiv}
                size="sm"
                title="Add block"
                type="button"
                variant="outline"
              >
                <SquareIcon data-icon="inline-start" />
                Block
              </Button>
            </ButtonGroup>
          </ToolbarSection>

          <Separator
            className="hidden h-auto self-stretch sm:block"
            orientation="vertical"
          />

          <ToolbarSection label="Modify">
            <Button
              disabled={!canMutateSelection || isEditingText}
              onClick={onEditText}
              size="sm"
              title="Edit text content"
              type="button"
              variant={isEditingText ? "secondary" : "outline"}
            >
              <PencilSimpleIcon data-icon="inline-start" />
              Edit text
            </Button>

            <ButtonGroup>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onFontSizeStep(-FONT_SIZE_STEP);
                }}
                size="icon-sm"
                title="Decrease font size"
                type="button"
                variant="outline"
              >
                <MinusIcon />
              </Button>
              <Input
                aria-label="Font size"
                className="h-7 w-14 rounded-none border-x-0 text-center text-xs"
                disabled={!canMutateSelection}
                inputMode="numeric"
                onBlur={onFontSizeInputCommit}
                onChange={(event) => {
                  setFontSizeDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                title="Font size (px)"
                value={fontSizeDraft}
              />
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onFontSizeStep(FONT_SIZE_STEP);
                }}
                size="icon-sm"
                title="Increase font size"
                type="button"
                variant="outline"
              >
                <PlusIcon />
              </Button>
            </ButtonGroup>

            <ButtonGroup>
              <Button
                disabled={!canMutateSelection}
                onClick={onToggleBold}
                size="icon-sm"
                title="Toggle bold"
                type="button"
                variant={selectionMeta?.isBold ? "secondary" : "outline"}
              >
                <TextBIcon />
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onTextAlign("left");
                }}
                size="icon-sm"
                title="Align left"
                type="button"
                variant={alignIs("left") ? "secondary" : "outline"}
              >
                <AlignLeftSimpleIcon />
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onTextAlign("center");
                }}
                size="icon-sm"
                title="Align center"
                type="button"
                variant={alignIs("center") ? "secondary" : "outline"}
              >
                <AlignCenterHorizontalSimpleIcon />
              </Button>
            </ButtonGroup>

            <ButtonGroup>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onNudge("x", -NUDGE_STEP_PX);
                }}
                size="icon-sm"
                title="Nudge left"
                type="button"
                variant="outline"
              >
                <ArrowLeftIcon />
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onNudge("y", -NUDGE_STEP_PX);
                }}
                size="icon-sm"
                title="Nudge up"
                type="button"
                variant="outline"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onNudge("y", NUDGE_STEP_PX);
                }}
                size="icon-sm"
                title="Nudge down"
                type="button"
                variant="outline"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={() => {
                  onNudge("x", NUDGE_STEP_PX);
                }}
                size="icon-sm"
                title="Nudge right"
                type="button"
                variant="outline"
              >
                <ArrowRightIcon />
              </Button>
            </ButtonGroup>

            <ButtonGroup>
              <Button
                disabled={!canMutateSelection}
                onClick={onSendBackward}
                size="sm"
                title="Send backward"
                type="button"
                variant="outline"
              >
                <StackSimpleIcon data-icon="inline-start" />
                Back
              </Button>
              <Button
                disabled={!canMutateSelection}
                onClick={onBringForward}
                size="sm"
                title="Bring forward"
                type="button"
                variant="outline"
              >
                <StackSimpleIcon
                  className="rotate-180"
                  data-icon="inline-start"
                />
                Forward
              </Button>
            </ButtonGroup>

            <Button
              disabled={!canMutateSelection}
              onClick={onDuplicate}
              size="sm"
              title="Duplicate selected"
              type="button"
              variant="outline"
            >
              <CopyIcon data-icon="inline-start" />
              Duplicate
            </Button>

            <Button
              disabled={!hasSelection}
              onClick={selectParent}
              size="sm"
              title="Select parent element"
              type="button"
              variant="outline"
            >
              <TreeStructureIcon data-icon="inline-start" />
              Parent
            </Button>
          </ToolbarSection>

          <Separator
            className="hidden h-auto self-stretch sm:block"
            orientation="vertical"
          />

          <ToolbarSection label="Delete">
            <Button
              disabled={!canMutateSelection}
              onClick={deleteSelected}
              size="sm"
              title="Delete selected element"
              type="button"
              variant="outline"
            >
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
            <Button
              disabled={!hasSelection}
              onClick={clearSelection}
              size="sm"
              title="Clear selection"
              type="button"
              variant="ghost"
            >
              Deselect
            </Button>
          </ToolbarSection>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <CursorIcon className="size-3.5" />
            Adjustments auto-save · Mod+Z undo · Mod+Y redo · Drag/resize/rotate
            · Double-click edit
          </span>
          {selectionMeta ? (
            <span className="inline-flex items-center gap-1.5">
              <SelectionIcon className="size-3.5" />
              {targets.length > 1 ? (
                <span>{targets.length} selected</span>
              ) : (
                <>
                  Selected{" "}
                  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                    &lt;{selectionMeta.tag}&gt;
                  </code>
                </>
              )}
              {selectionMeta.isOverlayRoot ? (
                <span className="text-muted-foreground/80">
                  (root — add/delete children instead)
                </span>
              ) : null}
              {isEditingText ? (
                <span className="text-primary">
                  · editing text (Esc to finish)
                </span>
              ) : null}
            </span>
          ) : (
            <span>No selection — click or drag on the canvas</span>
          )}
        </div>
      </div>

      <div
        className="bg-muted relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-lg border"
        ref={previewContainerRef}
      >
        <div
          className="relative shrink-0 overflow-hidden"
          style={{
            height: scaledHeight,
            width: scaledWidth,
          }}
        >
          <div
            className="relative overflow-hidden bg-black"
            onDoubleClick={onHostDoubleClick}
            ref={stageRef}
            style={{
              height: ANNOUNCEMENT_HEIGHT,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
              width: ANNOUNCEMENT_WIDTH,
            }}
          >
            {backgroundUrl ? (
              <img
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                crossOrigin="anonymous"
                draggable={false}
                src={backgroundUrl}
              />
            ) : (
              <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-2xl">
                Select or generate a background
              </div>
            )}

            <div
              aria-label="Announcement overlay canvas"
              className={cn(
                "absolute inset-0 size-full [&_.announcement-overlay]:size-full",
                isEditingText ? "cursor-text" : "cursor-default"
              )}
              onBlur={onHostBlur}
              ref={hostRef}
            />
          </div>

          {containerReady && !isEditingText ? (
            <>
              <Moveable
                container={null}
                draggable={canMutateSelection}
                edge={false}
                keepRatio={false}
                onClickGroup={(event) => {
                  selectoRef.current?.clickTarget(
                    event.inputEvent,
                    event.inputTarget
                  );
                }}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                onDragGroup={onDragGroup}
                onDragGroupEnd={onDragGroupEnd}
                onDragGroupStart={onDragGroupStart}
                onDragStart={onDragStart}
                onResize={onResize}
                onResizeEnd={onResizeEnd}
                onResizeGroup={onResizeGroup}
                onResizeGroupEnd={onResizeGroupEnd}
                onResizeGroupStart={onResizeGroupStart}
                onResizeStart={onResizeStart}
                onRotate={onRotate}
                onRotateEnd={onRotateEnd}
                onRotateGroup={onRotateGroup}
                onRotateGroupEnd={onRotateGroupEnd}
                onRotateGroupStart={onRotateGroupStart}
                onRotateStart={onRotateStart}
                origin={false}
                padding={{ bottom: 0, left: 0, right: 0, top: 0 }}
                ref={moveableRef}
                resizable={canMutateSelection}
                rootContainer={previewContainerRef.current}
                rotatable={canMutateSelection}
                // Keep snappable off — center snaps were yanking newly selected items.
                snappable={false}
                target={targets}
                throttleDrag={0}
                throttleResize={0}
                throttleRotate={0}
                zoom={previewScale}
              />
              <Selecto
                boundContainer={previewContainerRef.current}
                continueSelect={false}
                dragCondition={(event) => {
                  const moveable = moveableRef.current;
                  const inputTarget = event.inputEvent.target;

                  if (!(moveable && inputTarget instanceof Element)) {
                    return true;
                  }

                  if (moveable.isMoveableElement(inputTarget)) {
                    return false;
                  }

                  if (
                    targetsRef.current.some(
                      (target) =>
                        target === inputTarget || target.contains(inputTarget)
                    )
                  ) {
                    return false;
                  }

                  return true;
                }}
                dragContainer={previewContainerRef.current}
                hitRate={0}
                onDragStart={(event) => {
                  const moveable = moveableRef.current;
                  const inputTarget = event.inputEvent.target;

                  if (!(moveable && inputTarget instanceof Element)) {
                    return;
                  }

                  if (moveable.isMoveableElement(inputTarget)) {
                    event.stop();
                    return;
                  }

                  if (
                    targetsRef.current.some(
                      (target) =>
                        target === inputTarget || target.contains(inputTarget)
                    )
                  ) {
                    event.stop();
                  }
                }}
                onSelectEnd={(event) => {
                  const selected = event.selected.filter(
                    (node): node is HTMLElement => node instanceof HTMLElement
                  );

                  setSelection(selected);

                  // Only hand off to Moveable when the pointer is still down
                  // (click-and-drag). Pure click ends with buttons===0; calling
                  // dragStart then caused a synthetic first-drag jump.
                  if (
                    event.isDragStartEnd &&
                    isPointerStillDown(event.inputEvent)
                  ) {
                    event.inputEvent.preventDefault();
                    void (async () => {
                      await moveableRef.current?.waitToChangeTarget();
                      moveableRef.current?.dragStart(event.inputEvent);
                    })();
                  }
                }}
                preventDefault
                ratio={0}
                ref={selectoRef}
                selectByClick
                selectFromInside={false}
                selectableTargets={[
                  () => listSelectableElements(hostRef.current),
                ]}
                toggleContinueSelect="shift"
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
