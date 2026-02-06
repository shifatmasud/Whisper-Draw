/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { toLocal } from './Util.ts';
import { broadcastSelectionType, broadcastSelectionProperties } from './SelectToolManager.ts';

/**
 * ✒️ Pen Tool Manager
 * Manages all state and interactions for the vector Pen tool.
 */

export function handlePenDown(engine: CanvasEngine, sceneX: number, sceneY: number, group: Two.Group) {
    const HIT = 12;
    if (engine.penPath && engine.selectedAnchorIdx !== -1) {
      const v = engine.penPath.vertices[engine.selectedAnchorIdx];
      if (v && v.controls) {
        const local = toLocal(engine, engine.penPath, sceneX, sceneY);
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y;
        const rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        if (Math.hypot(local.x - lx, local.y - ly) < HIT) { engine.penInteraction = { mode: 'dragging-handle-left', dragStart: {x: local.x, y: local.y}, initialPos: {x: lx, y: ly} }; return; }
        if (Math.hypot(local.x - rx, local.y - ry) < HIT) { engine.penInteraction = { mode: 'dragging-handle-right', dragStart: {x: local.x, y: local.y}, initialPos: {x: rx, y: ry} }; return; }
      }
    }
    if (engine.penPath) {
      const local = toLocal(engine, engine.penPath, sceneX, sceneY);
      for (let i = 0; i < engine.penPath.vertices.length; i++) {
        if (Math.hypot(local.x - engine.penPath.vertices[i].x, local.y - engine.penPath.vertices[i].y) < HIT) {
          if (i === 0 && engine.penPath.vertices.length > 2 && !engine.penPath.closed) { engine.penPath.closed = true; finishPath(engine); return; }
          updateAnchorSelection(engine, i); 
          engine.penInteraction = { 
            mode: 'dragging-anchor', 
            dragStart: {x: local.x, y: local.y}, 
            initialPos: {x: engine.penPath.vertices[i].x, y: engine.penPath.vertices[i].y} 
          }; 
          return;
        }
      }
    }
    
    if (!engine.penPath || engine.penPath.closed) {
      const path = new Two.Path([], false, true, true);
      path.stroke = engine.settings.strokeEnabled ? engine.settings.strokeColor : '#000'; 
      path.linewidth = engine.settings.strokeWidth; 
      path.fill = engine.settings.fillEnabled ? engine.settings.fillColor : 'transparent';
      group.add(path); engine.penPath = path;
      const local = toLocal(engine, path, sceneX, sceneY);
      path.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      updateAnchorSelection(engine, 0);
      engine.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    } else {
      const local = toLocal(engine, engine.penPath, sceneX, sceneY);
      engine.penPath.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      updateAnchorSelection(engine, engine.penPath.vertices.length - 1);
      engine.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    }
    updatePenHelpers(engine);
}

export function handlePenMove(engine: CanvasEngine, sceneX: number, sceneY: number) {
    if (!engine.penPath || engine.penInteraction.mode === 'idle') return;
    const local = toLocal(engine, engine.penPath, sceneX, sceneY);
    const v = engine.penPath.vertices[engine.selectedAnchorIdx]; 
    if (!v || !v.controls) return;
    
    if (engine.penInteraction.mode === 'creating') {
      const dx = local.x - v.x, dy = local.y - v.y; 
      v.controls.right.set(dx, dy); 
      v.controls.left.set(-dx, -dy);
    } else if (engine.penInteraction.mode === 'dragging-anchor') {
      v.x = engine.penInteraction.initialPos.x + (local.x - engine.penInteraction.dragStart.x);
      v.y = engine.penInteraction.initialPos.y + (local.y - engine.penInteraction.dragStart.y);
    } else if (engine.penInteraction.mode === 'dragging-handle-left') {
      const dx = engine.penInteraction.initialPos.x + (local.x - engine.penInteraction.dragStart.x) - v.x;
      const dy = engine.penInteraction.initialPos.y + (local.y - engine.penInteraction.dragStart.y) - v.y;
      v.controls.left.set(dx, dy); 
      if (engine.settings.penHandleMode === 'mirrored') v.controls.right.set(-dx, -dy);
    } else if (engine.penInteraction.mode === 'dragging-handle-right') {
      const dx = engine.penInteraction.initialPos.x + (local.x - engine.penInteraction.dragStart.x) - v.x;
      const dy = engine.penInteraction.initialPos.y + (local.y - engine.penInteraction.dragStart.y) - v.y;
      v.controls.right.set(dx, dy); 
      if (engine.settings.penHandleMode === 'mirrored') v.controls.left.set(-dx, -dy);
    }
    updatePenHelpers(engine);
}

export function updatePenHelpers(engine: CanvasEngine) {
    if (engine.penHelpers) engine.two.remove(engine.penHelpers); 
    if (!engine.penPath || engine.tool !== 'pen') return;
    
    const h = new Two.Group(); 
    engine.penHelpers = h;
    h.matrix.copy(engine.getGlobalMatrix(engine.penPath));
    
    engine.penPath.vertices.forEach((v: any, i: number) => {
      const sel = i === engine.selectedAnchorIdx;
      const c = new Two.Circle(v.x, v.y, sel ? 6 : 4); 
      c.fill = sel ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF'); 
      c.stroke = '#1565C0'; 
      h.add(c);
      
      if (sel && v.controls) {
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y, rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        const lL = new Two.Line(v.x, v.y, lx, ly), lR = new Two.Line(v.x, v.y, rx, ry); 
        lL.stroke = lR.stroke = '#1565C0'; h.add(lL, lR);
        const cL = new Two.Circle(lx, ly, 4), cR = new Two.Circle(rx, ry, 4); 
        cL.fill = cR.fill = '#FFFFFF'; cL.stroke = '#1565C0'; h.add(cL, cR);
      }
    });
    engine.two.add(h);
}

export function finishPath(engine: CanvasEngine) { 
    engine.penPath = null; 
    updateAnchorSelection(engine, -1); 
    if (engine.penHelpers) engine.two.remove(engine.penHelpers); 
    engine.penHelpers = null; 
    engine.penInteraction.mode = 'idle'; 
}

export function updateAnchorSelection(engine: CanvasEngine, idx: number) { 
    engine.selectedAnchorIdx = idx; 
    engine.onAnchorSelect?.(idx !== -1); 
    if (idx !== -1) {
      broadcastSelectionType(engine, engine.penPath);
      broadcastSelectionProperties(engine, engine.penPath);
    }
}

export function setPathClosed(engine: CanvasEngine, closed: boolean) {
    if (engine.penPath) {
        engine.penPath.closed = closed;
        updatePenHelpers(engine);
    }
}

export function deleteSelectedAnchor(engine: CanvasEngine) {
    if (engine.penPath && engine.selectedAnchorIdx > -1 && engine.penPath.vertices.length > 1) {
        engine.penPath.vertices.splice(engine.selectedAnchorIdx, 1);
        updateAnchorSelection(engine, -1);
        updatePenHelpers(engine);
    }
}

export function setAnchorSharp(engine: CanvasEngine) {
    if (engine.penPath && engine.selectedAnchorIdx > -1) {
        const v = engine.penPath.vertices[engine.selectedAnchorIdx];
        if (v && v.controls) {
            v.controls.left.set(0, 0);
            v.controls.right.set(0, 0);
            updatePenHelpers(engine);
        }
    }
}
