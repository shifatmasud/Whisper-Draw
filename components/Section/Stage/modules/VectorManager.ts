/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { selectShape } from './SelectToolManager.ts';
import { getGlobalMatrix } from './Util.ts';

/**
 * 🧬 Vector Manager
 * Handles high-level operations on vector objects, such as ungrouping
 * and converting primitives into editable paths (flattening).
 */

export function flattenSelectedShape(engine: CanvasEngine) {
    if (!engine.selectedShape) return;
    
    const s = engine.selectedShape;
    const parent = s.parent;
    if (!parent) return;

    const isPrimitive = s instanceof Two.Rectangle || s instanceof Two.Ellipse || s instanceof Two.Polygon || s instanceof Two.Star || s instanceof Two.Line || s._isRoundedRect;
    
    if (s instanceof Two.Path && !isPrimitive) return;

    let path: any;
    if (typeof s.toPath === 'function') {
      const isClosed = s.closed !== undefined ? s.closed : true;
      path = s.toPath(isClosed);
    } else if (s instanceof Two.Path) {
      path = s.clone();
    } else {
      return;
    }

    path.matrix.copy(s.matrix);
    path.fill = s.fill;
    path.stroke = s.stroke;
    path.linewidth = s.linewidth;
    path.opacity = s.opacity;
    path.visible = s.visible;
    path.cap = s.cap;
    path.join = s.join;
    
    parent.add(path);
    s.remove();
    
    selectShape(engine, path);
    if (engine.activeLayerId) engine.generateThumbnail(engine.activeLayerId);
}

export function ungroupSelected(engine: CanvasEngine) {
    if (!engine.selectedShape || !(engine.selectedShape instanceof Two.Group)) return;

    const group = engine.selectedShape;
    const parent = group.parent;
    if (!parent) return;

    engine.two.update();

    const parentWorldInverse = getGlobalMatrix(engine, parent).clone().inverse();
    if (!parentWorldInverse) return;
    
    const children = [...group.children];

    children.forEach(child => {
        const childWorldMatrix = getGlobalMatrix(engine, child);
        parent.add(child);
        const newLocalMatrix = parentWorldInverse.clone().multiply(...childWorldMatrix.elements);
        child.matrix.copy(newLocalMatrix);
    });
    
    group.remove();
    engine.selectedShape = null;
    engine.updateSelectionHandles();
    engine.onSelectionTypeChange?.(null);
    if (engine.activeLayerId) engine.generateThumbnail(engine.activeLayerId);
}
