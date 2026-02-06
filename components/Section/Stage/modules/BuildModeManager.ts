/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import paper from 'paper';
import type { CanvasEngine } from '../Engine.ts';
import { twoShapeToPaperPath, paperPathToTwoShape } from './Conversions.ts';

/**
 * 🛠️ Build Mode Manager
 * Handles the logic for the vector boolean operations mode ("Build" mode).
 * This includes converting shapes to shards, handling lasso selection,
 * and performing unite/subtract operations.
 */

export function enterBuildMode(engine: CanvasEngine) {
    exitBuildMode(engine);
    if (!engine.activeLayerId) return;
    const group = engine.groups.get(engine.activeLayerId);
    if (!group || group.children.length === 0) return;

    engine.buildState.isActive = true;
    engine.buildState.container = new Two.Group();
    engine.two.add(engine.buildState.container);

    engine.buildState.originalShapes = [...group.children];
    engine.buildState.originalShapes.forEach(s => s.visible = false);

    engine.paperScope.project.activeLayer.removeChildren();
    const paperPaths = engine.buildState.originalShapes.map(s => twoShapeToPaperPath(engine, s)).filter(p => p) as paper.PathItem[];
    if (paperPaths.length === 0) { exitBuildMode(engine); return; }

    let combined: paper.PathItem = paperPaths[0];
    for (let i = 1; i < paperPaths.length; i++) {
        combined = combined.unite(paperPaths[i]);
    }

    const items = combined.children ? [...combined.children] : [combined];
    engine.buildState.shards = items.map(item => {
        const twoShard = paperPathToTwoShape(engine, item as paper.PathItem, engine.buildState.container!);

        const applyShardStyle = (s: any) => {
            if (s instanceof Two.Group) {
                s.children.forEach(applyShardStyle);
            } else {
                s.fill = '#007bff33';
                s.stroke = '#007bff';
                s.linewidth = 1;
            }
        };
        applyShardStyle(twoShard);

        engine.buildState.container!.add(twoShard);
        return { two: twoShard, paper: item as paper.PathItem };
    });

    engine.buildState.lassoPath = new Two.Path([], false, false, true);
    engine.buildState.lassoPath.fill = '#007bff22';
    engine.buildState.lassoPath.stroke = '#007bff';
    engine.buildState.lassoPath.linewidth = 1;
    engine.buildState.lassoPath.dashes = [4, 4];
    engine.buildState.container!.add(engine.buildState.lassoPath);
}

export function exitBuildMode(engine: CanvasEngine) {
    if (!engine.buildState.isActive) return;
    engine.buildState.isActive = false;
    engine.buildState.container?.remove();
    engine.buildState.originalShapes.forEach(s => s.visible = true);
    engine.buildState.shards = [];
    engine.buildState.originalShapes = [];
    engine.buildState.container = null;
    engine.buildState.lassoPath = null;
}

export function updateBuildLasso(engine: CanvasEngine, x: number, y: number) {
    if (!engine.buildState.lassoPath) return;
    engine.buildState.lassoPoints.push({ x, y });
    engine.buildState.lassoPath.vertices.push(new Two.Anchor(x, y));
}

export function finalizeBuild(engine: CanvasEngine) {
    if (!engine.buildState.isActive || !engine.activeLayerId || engine.buildState.lassoPoints.length < 3) {
        enterBuildMode(engine); // Reset view
        return;
    }

    const group = engine.groups.get(engine.activeLayerId);
    if (!group) return;

    engine.paperScope.project.activeLayer.removeChildren();
    const lassoPaper = new engine.paperScope.Path(engine.buildState.lassoPoints.map(p => new engine.paperScope.Point(p.x, p.y)));
    lassoPaper.closed = true;

    const selectedShards: paper.PathItem[] = [];
    const remainingShards: paper.PathItem[] = [];

    engine.buildState.shards.forEach(shard => {
        if (lassoPaper.intersects(shard.paper) || lassoPaper.contains(shard.paper.bounds)) {
            selectedShards.push(shard.paper);
        } else {
            remainingShards.push(shard.paper);
        }
    });

    if (selectedShards.length === 0) {
        enterBuildMode(engine); return;
    }

    group.remove(group.children); // Clear the layer

    let finalPaperShapes: paper.PathItem[] = [];

    if (engine.settings.buildMode === 'add' && selectedShards.length > 1) {
        let united: paper.PathItem = selectedShards[0];
        for (let i = 1; i < selectedShards.length; i++) {
            united = united.unite(selectedShards[i]);
        }
        finalPaperShapes = [...remainingShards, united];
    } else if (engine.settings.buildMode === 'subtract') {
        finalPaperShapes = remainingShards;
    } else {
        finalPaperShapes = [...remainingShards, ...selectedShards];
    }

    finalPaperShapes.forEach(shape => {
        const twoShape = paperPathToTwoShape(engine, shape, group);
        const applyFinalStyle = (s: any) => {
            if (s instanceof Two.Group) {
                s.children.forEach(applyFinalStyle);
            } else if (s instanceof Two.Path) {
                s.fill = engine.settings.fillColor;
                s.stroke = engine.settings.strokeColor;
                s.linewidth = engine.settings.strokeWidth;
            }
        };
        applyFinalStyle(twoShape);
        group.add(twoShape);
    });

    exitBuildMode(engine);
    enterBuildMode(engine); // Re-initialize with new shapes
}
