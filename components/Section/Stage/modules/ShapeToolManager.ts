/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { toLocal } from './Util.ts';

/**
 * 🔶 Shape Tool Manager
 * Handles the creation and real-time drawing of primitive shapes.
 */

export function handleShapeDown(engine: CanvasEngine, x: number, y: number, group: Two.Group) {
    if (engine.settings.shapeMode === 'build') return;
    const local = toLocal(engine, group, x, y);
    engine.shapeOrigin = { x: local.x, y: local.y };
    let s: any;

    if (engine.settings.shapeType === 'rectangle') {
        engine.tempShape = new Two.Group();
        group.add(engine.tempShape);
        handleShapeMove(engine, x, y); // Initial draw
        return;
    } else if (engine.settings.shapeType === 'ellipse') {
        s = new Two.Ellipse(local.x, local.y, 0, 0);
    } else if (engine.settings.shapeType === 'star') {
        s = new Two.Star(local.x, local.y, 0, 0, engine.settings.starPoints);
    } else if (engine.settings.shapeType === 'polygon') {
        s = new Two.Polygon(local.x, local.y, 0, engine.settings.polygonSides);
    } else if (engine.settings.shapeType === 'line') {
        s = new Two.Line(local.x, local.y, local.x, local.y);
    }

    if (s) {
        s.fill = engine.settings.fillEnabled ? engine.settings.fillColor : 'transparent';
        s.stroke = engine.settings.strokeEnabled ? engine.settings.strokeColor : 'transparent';
        s.linewidth = engine.settings.strokeWidth;
        group.add(s);
        engine.tempShape = s;
    }
}

export function handleShapeMove(engine: CanvasEngine, x: number, y: number) {
    if (!engine.tempShape || engine.settings.shapeMode === 'build') return;
    const local = toLocal(engine, engine.tempShape.parent, x, y);
    
    if (engine.tempShape instanceof Two.Line) {
        engine.tempShape.vertices[1].x = local.x;
        engine.tempShape.vertices[1].y = local.y;
        return;
    }

    const w = Math.abs(local.x - engine.shapeOrigin.x);
    const h = Math.abs(local.y - engine.shapeOrigin.y);
    const cx = (local.x + engine.shapeOrigin.x) / 2;
    const cy = (local.y + engine.shapeOrigin.y) / 2;

    if (engine.tempShape instanceof Two.Group) {
        engine.tempShape.remove(engine.tempShape.children);
        const r = engine.two.makeRoundedRectangle(cx, cy, w, h, engine.settings.cornerRadius);
        r.fill = engine.settings.fillEnabled ? engine.settings.fillColor : 'transparent';
        r.stroke = engine.settings.strokeEnabled ? engine.settings.strokeColor : 'transparent';
        r.linewidth = engine.settings.strokeWidth;
        (r as any)._isRoundedRect = true;
        (r as any)._cornerRadius = engine.settings.cornerRadius;
        engine.tempShape.add(r);
        return;
    }

    engine.tempShape.translation.set(cx, cy);
    const rad = Math.hypot(w, h) / 2;
    if (engine.tempShape instanceof Two.Ellipse) {
        engine.tempShape.width = w;
        engine.tempShape.height = h;
    } else if (engine.tempShape instanceof Two.Star) {
        engine.tempShape.outerRadius = rad;
        engine.tempShape.innerRadius = rad * engine.settings.starInnerRadius;
    } else if (engine.tempShape instanceof Two.Polygon) {
        (engine.tempShape as any).radius = rad;
    }
}

export function handleShapeUp(engine: CanvasEngine) {
    if (engine.tempShape instanceof Two.Group && engine.activeLayerId) {
        const r = engine.tempShape.children[0];
        if (r) {
            engine.tempShape.remove(r);
            engine.groups.get(engine.activeLayerId)?.add(r);
        }
        engine.tempShape.remove();
    }
    engine.tempShape = null;
}
