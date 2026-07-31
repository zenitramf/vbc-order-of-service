/**
 * Apply a CanvasPlan through the live GrapesJS Editor API.
 * Produces compliant component models — never loads model HTML/JSON trees.
 */

import type { Component, Editor } from "grapesjs";

import type { CanvasOp, CanvasPlan } from "~/lib/announcement-ai-plan";
import { getAnnouncementBlockDef } from "~/lib/announcement-block-templates";
import { coerceBackgroundToAlphaGradient } from "~/lib/announcement-overlay-html";
import {
  buildDesignPresetProject,
  roleSelector,
} from "~/lib/announcement-style-library";
import type { AnnouncementStyleRole } from "~/lib/announcement-style-library";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type { AnnouncementContent } from "~/lib/announcement-types";

interface StyleableComponent {
  addStyle: (style: Record<string, string>) => void;
  getStyle: () => Record<string, string | undefined>;
}

const isClearPaint = (value: string): boolean =>
  value === "" || value === "transparent" || value === "none";

const coerceComponentBackground = (component: StyleableComponent): boolean => {
  const style = component.getStyle();
  const background = (style.background ?? "").trim();
  const backgroundColor = (style["background-color"] ?? "").trim();
  const backgroundImage = (style["background-image"] ?? "").trim();

  if (
    /url\s*\(/iu.test(background) ||
    /url\s*\(/iu.test(backgroundImage) ||
    /url\s*\(/iu.test(backgroundColor)
  ) {
    return false;
  }

  if (/gradient\s*\(/iu.test(background)) {
    if (!isClearPaint(backgroundColor)) {
      component.addStyle({ "background-color": "transparent" });
      return true;
    }

    return false;
  }

  let solidSource: string | null = null;

  if (!isClearPaint(backgroundColor)) {
    solidSource = backgroundColor;
  } else if (!isClearPaint(background)) {
    solidSource = background;
  }

  if (!solidSource) {
    return false;
  }

  const gradient = coerceBackgroundToAlphaGradient(solidSource, "panel");
  component.addStyle({
    background: gradient,
    "background-color": "transparent",
  });
  return true;
};

const ensureStageGeometry = (editor: Editor): void => {
  const wrapper = editor.getWrapper();

  if (!wrapper) {
    return;
  }

  wrapper.addStyle({
    height: `${ANNOUNCEMENT_HEIGHT}px`,
    "max-height": `${ANNOUNCEMENT_HEIGHT}px`,
    "min-height": `${ANNOUNCEMENT_HEIGHT}px`,
    overflow: "hidden",
    position: "relative",
    width: `${ANNOUNCEMENT_WIDTH}px`,
  });
};

const clearCanvas = (editor: Editor): void => {
  editor.DomComponents.clear();
  editor.CssComposer.clear();
  ensureStageGeometry(editor);
};

const applyPreset = (
  editor: Editor,
  packId: string,
  content: AnnouncementContent
): void => {
  const project = buildDesignPresetProject(packId, content);

  if (!project) {
    throw new Error(`Unknown design preset: ${packId}`);
  }

  editor.loadProjectData(project);
  ensureStageGeometry(editor);
};

const findByRole = (
  editor: Editor,
  role: AnnouncementStyleRole | "wrapper",
  index = 0
): Component | null => {
  if (role === "wrapper") {
    return editor.getWrapper() ?? null;
  }

  const wrapper = editor.getWrapper();

  if (!wrapper) {
    return null;
  }

  const matches = wrapper.find(roleSelector(role));
  return matches[index] ?? null;
};

const setTextContent = (component: Component, text: string): void => {
  const type = component.get("type");

  if (type === "text" || type === "link" || type === "textnode") {
    component.set("content", text);
    return;
  }

  const children = component.components();

  if (!children || children.length === 0) {
    component.set("content", text);
    return;
  }

  if (children.length === 1) {
    const child = children.at(0);

    if (child) {
      const childType = child.get("type");

      if (childType === "text" || childType === "textnode" || !childType) {
        child.set("content", text);
        return;
      }
    }
  }

  component.set("content", text);
};

const runOp = (
  editor: Editor,
  op: CanvasOp,
  content: AnnouncementContent
): void => {
  switch (op.op) {
    case "clear": {
      clearCanvas(editor);
      return;
    }
    case "applyPreset": {
      applyPreset(editor, op.packId, content);
      return;
    }
    case "addBlock": {
      const def = getAnnouncementBlockDef(op.blockId, {
        content: op.content,
        role: op.role,
        style: op.style,
      });
      const parent = findByRole(editor, op.parentRole ?? "wrapper");

      if (!parent) {
        editor.Components.addComponent(def);
        return;
      }

      parent.append(def);
      return;
    }
    case "updateRole": {
      const target = findByRole(editor, op.role, op.index ?? 0);

      if (!target) {
        return;
      }

      if (op.remove) {
        target.remove();
        return;
      }

      if (op.content !== undefined) {
        setTextContent(target, op.content);
      }

      if (op.style) {
        target.addStyle(op.style);
      }

      return;
    }
    case "setStageStyle": {
      const wrapper = editor.getWrapper();

      if (!wrapper) {
        return;
      }

      wrapper.addStyle(op.style);
      ensureStageGeometry(editor);
      return;
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
    }
  }
};

const coerceAllBackgrounds = (editor: Editor): void => {
  const wrapper = editor.getWrapper();

  if (!wrapper) {
    return;
  }

  wrapper.onAll((component) => {
    if (component === wrapper) {
      return;
    }

    coerceComponentBackground(component as unknown as StyleableComponent);
  });
};

/**
 * Apply AI layout ops via GrapesJS APIs.
 * Caller should suppress emit, re-sync Body photo, serialize, and clear undo.
 */
export const applyCanvasPlanToEditor = (
  editor: Editor,
  plan: CanvasPlan,
  content: AnnouncementContent
): void => {
  const [first] = plan.ops;
  const startsStructural = first?.op === "clear" || first?.op === "applyPreset";

  if (!startsStructural) {
    applyPreset(editor, plan.basePresetId ?? "classic-bottom", content);
  }

  for (const op of plan.ops) {
    runOp(editor, op, content);
  }

  coerceAllBackgrounds(editor);
  ensureStageGeometry(editor);
};
