/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';

/**
 * ⚙️ Utilities
 * A collection of helper functions for matrix math, coordinate transformations,
 * and other common tasks used by various engine modules.
 */

export function getGlobalMatrix(engine: CanvasEngine, obj: any): Two.Matrix {
    const matrix = new Two.Matrix();
    if (!obj || obj === engine.two.scene) return matrix;

    const stack: any[] = [];
    let current = obj;
    while (current && current !== engine.two.scene) {
        stack.push(current);
        current = current.parent;
    }

    for (let i = stack.length - 1; i >= 0; i--) {
        const m = stack[i]._matrix;
        if (m) matrix.multiply(...m.elements);
    }

    return matrix;
}

export function toLocal(engine: CanvasEngine, obj: any, sceneX: number, sceneY: number) {
    const globalMatrix = getGlobalMatrix(engine, obj);
    const m = globalMatrix.clone().inverse();
    
    if (!m) return { x: sceneX, y: sceneY };

    const transformed = m.multiply(sceneX, sceneY, 1);
    return { x: transformed.x, y: transformed.y };
}
