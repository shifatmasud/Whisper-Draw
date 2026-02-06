/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { SelectedObjectType, ToolSettings } from '../../../../types/index.tsx';

/**
 * 👉 Select Tool Manager
 * Handles object selection, bounding box display, and broadcasting selection
 * properties to the properties panel.
 */

export function selectShape(engine: CanvasEngine, shape: any) {
    engine.selectedShape = shape;
    updateSelectionHandles(engine);
    broadcastSelectionType(engine, shape);
    broadcastSelectionProperties(engine, shape);
}

export function updateSelectionHandles(engine: CanvasEngine) {
    if (engine.transformGroup) { engine.two.remove(engine.transformGroup); engine.transformGroup = null; }
    if (!engine.selectedShape || engine.tool !== 'select') return;

    const bounds = engine.selectedShape.getBoundingClientRect(true);
    const group = new Two.Group();
    engine.transformGroup = group;
    const rect = new Two.Rectangle(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, bounds.width + 10, bounds.height + 10);
    rect.noFill();
    rect.stroke = '#1565C0';
    rect.linewidth = 2;
    group.add(rect);

    [
        { x: bounds.left - 5, y: bounds.top - 5 },
        { x: bounds.right + 5, y: bounds.top - 5 },
        { x: bounds.right + 5, y: bounds.bottom + 5 },
        { x: bounds.left - 5, y: bounds.bottom + 5 }
    ].forEach(p => {
        const h = new Two.Circle(p.x, p.y, 5);
        h.fill = '#FFFFFF';
        h.stroke = '#1565C0';
        h.linewidth = 1;
        group.add(h);
    });
    engine.two.add(group);
}

export function broadcastSelectionType(engine: CanvasEngine, shape: any) {
    let type: SelectedObjectType = null;
    if (shape instanceof Two.Group) type = 'group';
    else if (shape._isRoundedRect) type = 'rectangle';
    else if (shape instanceof Two.Star) type = 'star';
    else if (shape instanceof Two.Polygon) type = 'polygon';
    else if (shape instanceof Two.Ellipse) type = 'ellipse';
    else if (shape instanceof Two.Line) type = 'line';
    else if (shape instanceof Two.Path) type = 'path';
    else if (shape instanceof Two.Rectangle) type = 'rectangle';
    engine.onSelectionTypeChange?.(type);
}

export function broadcastSelectionProperties(engine: CanvasEngine, shape: any) {
    let sample = shape instanceof Two.Group && shape.children.length > 0 ? shape.children[0] : shape;
    const stroke = sample.stroke, fill = sample.fill;
    const props: Partial<ToolSettings> = {
        strokeEnabled: stroke !== 'transparent',
        strokeColor: stroke === 'transparent' ? engine.settings.strokeColor : (typeof stroke === 'string' ? stroke : (stroke as any).toHexString?.() || engine.settings.strokeColor),
        fillEnabled: fill !== 'transparent',
        fillColor: fill === 'transparent' ? engine.settings.fillColor : (typeof fill === 'string' ? fill : (fill as any).toHexString?.() || engine.settings.fillColor),
        strokeWidth: sample.linewidth || engine.settings.strokeWidth,
        selectionX: shape.translation.x,
        selectionY: shape.translation.y,
        selectionRotation: (shape.rotation * 180) / Math.PI,
        selectionScale: typeof shape.scale === 'number' ? shape.scale : (shape.scale.x || 1),
    };
    if (sample._isRoundedRect) props.cornerRadius = sample._cornerRadius;
    if (sample instanceof Two.Star) { props.starPoints = sample.sides; props.starInnerRadius = sample.outerRadius > 0 ? sample.innerRadius / sample.outerRadius : 0.5; }
    if (sample instanceof Two.Polygon) props.polygonSides = sample.sides;
    engine.onSelectionPropertiesChange?.(props);
}

export function tryEnterEditMode(engine: CanvasEngine, x: number, y: number): boolean {
    if (!engine.activeLayerId) return false;
    const rootGroup = engine.groups.get(engine.activeLayerId);
    if (!rootGroup) return false;

    engine.two.update();

    const findPathAtPoint = (g: Two.Group, targetX: number, targetY: number): Two.Path | null => {
        for (let i = g.children.length - 1; i >= 0; i--) {
            const child = g.children[i];
            if (child instanceof Two.Path) {
                const bounds = child.getBoundingClientRect(true);
                if (targetX >= bounds.left && targetX <= bounds.right && targetY >= bounds.top && targetY <= bounds.bottom) {
                    return child as Two.Path;
                }
            } else if (child instanceof Two.Group) {
                const found = findPathAtPoint(child as Two.Group, targetX, targetY);
                if (found) return found;
            }
        }
        return null;
    };

    const path = findPathAtPoint(rootGroup, x, y);
    if (path) {
        engine.penPath = path;
        engine.selectedShape = null;
        if (engine.transformGroup) { engine.two.remove(engine.transformGroup); engine.transformGroup = null; }
        engine.setTool('pen');
        engine.onToolChange?.('pen');
        engine.updatePenHelpers();
        return true;
    }
    return false;
}
