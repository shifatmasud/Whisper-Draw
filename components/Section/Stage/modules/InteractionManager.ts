/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { finalizeBuild, updateBuildLasso } from './BuildModeManager.ts';
import { handlePenDown, handlePenMove } from './PenToolManager.ts';
import { selectShape, tryEnterEditMode } from './SelectToolManager.ts';
import { handleShapeDown, handleShapeMove, handleShapeUp } from './ShapeToolManager.ts';
import { toLocal } from './Util.ts';

/**
 * 👆 Interaction Manager
 * The main entry point for user interactions on the canvas. It delegates
 * pointer events to the appropriate tool handlers based on the current state.
 */

// --- Main Handlers ---

export function handleDown(engine: CanvasEngine, rawX: number, rawY: number) {
    const x = rawX - engine.two.width / 2;
    const y = rawY - engine.two.height / 2;
    const now = Date.now();
    
    // Double-click detection
    if (now - engine.lastClickTime < 300) {
      if (engine.tool === 'pen') { engine.finishPath(); engine.lastClickTime = 0; return; }
      if (engine.tool === 'select' && engine.selectedShape && engine.settings.selectionMode === 'vector') {
          if (tryEnterEditMode(engine, x, y)) { engine.lastClickTime = 0; return; }
      }
    }
    engine.lastClickTime = now;

    if (!engine.activeLayerId) return;
    const group = engine.groups.get(engine.activeLayerId);
    if (!group) return;
    
    // Build Mode takes precedence
    if (engine.tool === 'shape' && engine.settings.shapeMode === 'build' && engine.buildState.isActive) {
      engine.isInteracting = true;
      const local = toLocal(engine, engine.buildState.container!, x, y);
      engine.buildState.lassoPoints = []; engine.buildState.lassoPath!.vertices = [];
      updateBuildLasso(engine, local.x, local.y);
      return;
    }

    engine.isInteracting = true;
    switch (engine.tool) {
        case 'delete': handleDelete(engine, group, x, y); break;
        case 'select': handleSelect(engine, group, x, y); break;
        case 'pen': handlePenDown(engine, x, y, group); break;
        case 'brush': handleBrushDown(engine, x, y, group); break;
        case 'shape': handleShapeDown(engine, x, y, group); break;
    }
}

export function handleMove(engine: CanvasEngine, rawX: number, rawY: number) {
    if (!engine.isInteracting) return;
    const x = rawX - engine.two.width / 2;
    const y = rawY - engine.two.height / 2;
    if (!engine.activeLayerId) return;
    const group = engine.groups.get(engine.activeLayerId);
    if (!group) return;
    
    if (engine.tool === 'shape' && engine.settings.shapeMode === 'build' && engine.buildState.isActive) {
      const local = toLocal(engine, engine.buildState.container!, x, y);
      updateBuildLasso(engine, local.x, local.y);
    } else if (engine.tool === 'select' && engine.selectedShape) {
      const local = toLocal(engine, engine.selectedShape.parent, x, y);
      engine.selectedShape.translation.set(local.x - engine.dragOffset.x, local.y - engine.dragOffset.y);
      engine.updateSelectionHandles();
      engine.onSelectionPropertiesChange?.({ selectionX: engine.selectedShape.translation.x, selectionY: engine.selectedShape.translation.y });
    } else if (engine.tool === 'brush' && engine.currentPath) {
      const local = toLocal(engine, engine.currentPath.parent, x, y);
      engine.currentPath.vertices.push(new Two.Anchor(local.x, local.y));
    } else if (engine.tool === 'pen') { 
      handlePenMove(engine, x, y); 
    }
    else if (engine.tool === 'shape') { 
      handleShapeMove(engine, x, y); 
    }
}

export function handleUp(engine: CanvasEngine) {
    if (engine.tool === 'shape' && engine.settings.shapeMode === 'build' && engine.buildState.isActive && engine.isInteracting) {
        finalizeBuild(engine);
    }
    if (engine.isInteracting && engine.activeLayerId) engine.generateThumbnail(engine.activeLayerId);
    engine.isInteracting = false; 
    engine.currentPath = null;
    if (engine.tool === 'pen' && (engine.penInteraction.mode !== 'idle')) {
      engine.penInteraction.mode = 'idle';
    } else if (engine.tool === 'shape') {
      handleShapeUp(engine);
    }
}

// --- Tool-Specific Handlers ---

function handleSelect(engine: CanvasEngine, group: Two.Group, x: number, y: number) {
    engine.selectedShape = null;
    for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i];
        const bounds = child.getBoundingClientRect(true);
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
            selectShape(engine, child);
            const local = toLocal(engine, child.parent, x, y);
            engine.dragOffset = { x: local.x - child.translation.x, y: local.y - child.translation.y };
            return;
        }
    }
    engine.onSelectionTypeChange?.(null);
    engine.updateSelectionHandles();
}

function handleDelete(engine: CanvasEngine, group: Two.Group, x: number, y: number) {
    for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i];
        const bounds = child.getBoundingClientRect(true);
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
            child.remove();
            if (engine.activeLayerId) engine.generateThumbnail(engine.activeLayerId);
            break;
        }
    }
}

function handleBrushDown(engine: CanvasEngine, x: number, y: number, group: Two.Group) {
    const local = toLocal(engine, group, x, y);
    const p = new Two.Path([new Two.Anchor(local.x, local.y)], false, true);
    p.stroke = engine.settings.strokeEnabled ? engine.settings.strokeColor : '#000';
    p.linewidth = engine.settings.strokeWidth;
    p.fill = 'transparent';
    group.add(p);
    engine.currentPath = p;
}
