/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import paper from 'paper';
import type { CanvasEngine } from '../Engine.ts';
import { getGlobalMatrix } from './Util.ts';
import { twoMatrixToPaperMatrix } from '../PathUtils.ts';

/**
 * 🔄 Conversions Module
 * Handles the complex but necessary task of converting shapes between the
 * Two.js rendering library and the Paper.js geometry/boolean operations library.
 */

/**
 * Converts a Two.js shape into a Paper.js PathItem using SVG as an intermediary.
 * This is robust for all shape types, including primitives.
 * @param engine The CanvasEngine instance.
 * @param twoShape The Two.js shape to convert.
 * @returns A Paper.js PathItem, or null on failure.
 */
export function twoShapeToPaperPath(engine: CanvasEngine, twoShape: any): paper.PathItem | null {
    engine.paperScope.project.activeLayer.removeChildren();
    if (!twoShape) return null;

    const tempTwo = new Two({ type: Two.Types.svg, width: 1, height: 1 });
    const clone = twoShape.clone();
    const worldMatrix = getGlobalMatrix(engine, twoShape);
    
    clone.matrix.identity();
    tempTwo.add(clone);
    tempTwo.update();

    const svgString = tempTwo.renderer.domElement.outerHTML;
    if (!svgString) return null;

    const item = engine.paperScope.project.importSVG(svgString, { expandShapes: true });
    if (!item) return null;

    const paperMatrix = twoMatrixToPaperMatrix(worldMatrix, engine.paperScope);
    item.transform(paperMatrix);

    let pathItem: paper.PathItem | null = null;
    if (item instanceof engine.paperScope.PathItem) {
        pathItem = item;
    } else if (item instanceof engine.paperScope.Group && item.children.length > 0) {
        const compound = new engine.paperScope.CompoundPath({
            children: item.children.filter(c => c instanceof engine.paperScope.PathItem),
            fillRule: 'evenodd',
        });
        item.remove();
        pathItem = compound;
    }
    
    return pathItem;
}

/**
 * Converts a Paper.js path back into a Two.js shape using SVG as an intermediary.
 * @param engine The CanvasEngine instance.
 * @param paperPath The Paper.js item to convert.
 * @param parentGroup The target Two.js group for the new shape.
 * @returns A Two.Shape (typically a Two.Group or Two.Path).
 */
export function paperPathToTwoShape(engine: CanvasEngine, paperPath: paper.PathItem, parentGroup: Two.Group): Two.Shape {
    const svgString = (paperPath as any).exportSVG({ asString: true });
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = svgString;
    const svgNode = tempDiv.querySelector('svg');

    if (!svgNode) return new Two.Path([], false, false);

    const loadedShape = engine.two.interpret(svgNode);
    loadedShape.remove();

    const parentMatrixInv = getGlobalMatrix(engine, parentGroup).clone().inverse();
    if (parentMatrixInv) {
      loadedShape.matrix.premultiply(parentMatrixInv);
    }
    
    if (loadedShape.children.length === 1 && loadedShape.children[0] instanceof Two.Path) {
        const child = loadedShape.children[0];
        child.matrix.premultiply(loadedShape.matrix);
        loadedShape.remove(child);
        return child;
    }

    return loadedShape;
}
