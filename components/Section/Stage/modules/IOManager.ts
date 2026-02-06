/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import type { CanvasEngine } from '../Engine.ts';
import { normalizeImportedContent } from '../PathUtils.ts';
import { selectShape } from './SelectToolManager.ts';

/**
 * 💾 IO Manager
 * Handles input/output operations like generating thumbnails and importing assets.
 */

export function generateThumbnail(engine: CanvasEngine, layerId: string) {
    const group = engine.groups.get(layerId);
    if (!group) return;
    const clone = group.clone();
    clone.translation.set(0, 0); clone.scale = 1; clone.rotation = 0;
    engine.thumbTwo.clear(); engine.thumbTwo.add(clone);
    const bounds = clone.getBoundingClientRect();
    const maxDim = Math.max(bounds.width, bounds.height);
    if (maxDim > 0) {
      const scale = (engine.thumbTwo.width - 10) / maxDim;
      clone.scale = scale;
      const bbox = clone.getBoundingClientRect();
      const bx = bbox.left + bbox.width / 2;
      const by = bbox.top + bbox.height / 2;
      clone.translation.addSelf(new Two.Vector((engine.thumbTwo.width / 2) - bx, (engine.thumbTwo.height / 2) - by));
    }
    engine.thumbTwo.render();
    engine.onThumbnailReady?.(layerId, engine.thumbTwo.renderer.domElement.toDataURL('image/png', 0.5));
}

export function importSVG(engine: CanvasEngine, svgString: string) {
    if (!engine.activeLayerId) return;
    const group = engine.groups.get(engine.activeLayerId);
    if (!group) return;
    engine.two.load(svgString, (loadedGroup: Two.Group) => {
      if (loadedGroup) {
        normalizeImportedContent(loadedGroup);
        loadedGroup.center();
        loadedGroup.translation.set(0, 0);
        group.add(loadedGroup);
        selectShape(engine, loadedGroup);
        generateThumbnail(engine, engine.activeLayerId!);
      }
    });
}
