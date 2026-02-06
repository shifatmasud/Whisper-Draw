

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import { Layer, Tool, ToolSettings, SelectedObjectType, ShapeType } from '../../../types/index.tsx';

export class CanvasEngine {
  two: Two;
  thumbTwo: Two;
  groups: Map<string, Two.Group> = new Map();
  activeLayerId: string | null = null;
  tool: Tool = 'select';
  settings!: ToolSettings;

  // Callbacks
  onToolChange?: (tool: Tool) => void;
  onAnchorSelect?: (isSelected: boolean) => void;
  onSelectionTypeChange?: (type: SelectedObjectType) => void;
  onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
  onThumbnailReady?: (id: string, dataUrl: string) => void;

  // State
  selectedShape: any | null = null;
  transformGroup: Two.Group | null = null;
  isInteracting = false;
  dragOffset = { x: 0, y: 0 };
  currentPath: Two.Path | null = null;
  tempShape: any | null = null;
  shapeOrigin = { x: 0, y: 0 };

  // Pen Tool
  penPath: Two.Path | null = null;
  selectedAnchorIdx: number = -1;
  penHelpers: Two.Group | null = null;
  penInteraction = {
    mode: 'idle' as 'idle' | 'dragging-anchor' | 'dragging-handle-left' | 'dragging-handle-right' | 'creating',
    dragStart: { x: 0, y: 0 },
    initialPos: { x: 0, y: 0 }
  };

  // Build Mode
  buildState = {
    isActive: false,
    shards: [] as { two: Two.Shape }[],
    originalShapes: [] as any[],
    lassoPath: null as Two.Path | null,
    lassoPoints: [] as {x: number, y: number}[],
    container: null as Two.Group | null,
  };

  lastClickTime: number = 0;

  constructor(container: HTMLElement) {
    this.two = new Two({
      type: Two.Types.canvas,
      width: container.clientWidth,
      height: container.clientHeight,
      autostart: true,
    }).appendTo(container);

    // Center the scene
    this.two.scene.translation.set(this.two.width / 2, this.two.height / 2);

    const thumbCanvas = document.createElement('canvas');
    this.thumbTwo = new Two({
      type: Two.Types.canvas,
      width: 100,
      height: 100,
      domElement: thumbCanvas,
      autostart: false
    });
  }

  // --- CORE API ---

  public resize(width: number, height: number) {
    this.two.width = width;
    this.two.height = height;
    this.two.scene.translation.set(width / 2, height / 2);
    this.two.update();
  }

  public setTool(tool: Tool) {
    if (this.tool === tool) return;
    this.exitBuildMode();
    if (tool !== 'pen') this.finishPath();
    this.tool = tool;
    this.updateSelectionHandles();
    
    if (tool === 'select' && this.selectedShape) {
      this.broadcastSelectionType(this.selectedShape);
    } else if (tool !== 'select' && tool !== 'pen') {
      this.onSelectionTypeChange?.(null);
    }
    
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      this.enterBuildMode();
    }
  }

  public setActiveLayerId(id: string | null) {
    this.activeLayerId = id;
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      this.enterBuildMode();
    }
  }

  public setToolSettings(settings: ToolSettings) {
    const prevMode = this.settings?.shapeMode;
    this.settings = settings;
    if (this.tool === 'shape') {
      if (settings.shapeMode === 'build' && prevMode !== 'build') this.enterBuildMode();
      else if (settings.shapeMode !== 'build' && prevMode === 'build') this.exitBuildMode();
    }
    if (this.selectedShape) {
      this.applySettingsToShape(this.selectedShape);
      this.updateSelectedTransformFromSettings(settings);
    }
    if (this.penPath) {
      this.applySettingsToShape(this.penPath);
      this.penPath.closed = this.settings.penClosePath;
    }
  }

  private updateSelectedTransformFromSettings(settings: ToolSettings) {
    if (!this.selectedShape || this.isInteracting) return;
    let changed = false;
    if (settings.selectionX !== undefined && this.selectedShape.translation.x !== settings.selectionX) {
      this.selectedShape.translation.x = settings.selectionX;
      changed = true;
    }
    if (settings.selectionY !== undefined && this.selectedShape.translation.y !== settings.selectionY) {
      this.selectedShape.translation.y = settings.selectionY;
      changed = true;
    }
    if (settings.selectionRotation !== undefined) {
      const rad = (settings.selectionRotation * Math.PI) / 180;
      if (Math.abs(this.selectedShape.rotation - rad) > 0.0001) {
        this.selectedShape.rotation = rad;
        changed = true;
      }
    }
    if (settings.selectionScale !== undefined) {
      const currentScale = typeof this.selectedShape.scale === 'number' ? this.selectedShape.scale : this.selectedShape.scale.x;
      if (currentScale !== settings.selectionScale) {
        this.selectedShape.scale = settings.selectionScale;
        changed = true;
      }
    }
    if (changed) this.updateSelectionHandles();
  }

  public setCallbacks(callbacks: any) {
    this.onToolChange = callbacks.onToolChange;
    this.onAnchorSelect = callbacks.onAnchorSelect;
    this.onSelectionTypeChange = callbacks.onSelectionTypeChange;
    this.onSelectionPropertiesChange = callbacks.onSelectionPropertiesChange;
    this.onThumbnailReady = callbacks.onThumbnailReady;
  }

  public updateLayers(layers: Layer[]) {
    const activeIds = new Set<string>();
    const syncOrder = (items: Layer[], parent: Two.Group | Two.Scene) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const layer = items[i];
        activeIds.add(layer.id);
        let group = this.groups.get(layer.id);
        if (!group) {
          group = new Two.Group();
          group.id = layer.id;
          this.groups.set(layer.id, group);
        }
        parent.add(group);
        group.visible = layer.isVisible;
        group.opacity = layer.opacity;
        (group as any).blendMode = layer.blendMode;
        group.translation.set(layer.x, layer.y);
        group.scale = layer.scale;
        group.rotation = (layer.rotation * Math.PI) / 180;
        if (layer.children) syncOrder(layer.children, group);
      }
    };
    syncOrder(layers, this.two.scene);
    this.groups.forEach((g, id) => {
      if (!activeIds.has(id)) {
        g.remove();
        this.groups.delete(id);
      }
    });
    // Ensure overlays stay on top
    if (this.transformGroup) { this.two.scene.remove(this.transformGroup); this.two.scene.add(this.transformGroup); }
    if (this.penHelpers) { this.two.scene.remove(this.penHelpers); this.two.scene.add(this.penHelpers); }
    if (this.buildState.container) { this.two.scene.remove(this.buildState.container); this.two.scene.add(this.buildState.container); }
  }

  // --- COORDINATE HELPERS ---

  private get canvasRect(): DOMRect {
    return this.two.renderer.domElement.getBoundingClientRect();
  }

  public getGlobalMatrix(obj: any): Two.Matrix {
    const matrix = new Two.Matrix();
    const stack: any[] = [];
    let current = obj;
    while (current) {
      stack.push(current);
      current = current.parent;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      if (typeof stack[i]._update === 'function') {
        stack[i]._update();
      }
      matrix.multiply(stack[i].matrix);
    }
    return matrix;
  }

  private toLocal(obj: any, canvasX: number, canvasY: number) {
    const sceneX = canvasX - this.two.width / 2;
    const sceneY = canvasY - this.two.height / 2;

    const globalMatrix = this.getGlobalMatrix(obj);
    const m = (globalMatrix.clone() as any).inverse();
    if (!m) return { x: sceneX, y: sceneY };
    const transformed = m.multiply(sceneX, sceneY, 1);
    return { x: transformed.x, y: transformed.y };
  }

  public tryEnterEditMode(x: number, y: number): boolean {
    if (!this.selectedShape) {
      return false;
    }

    // Use bounding box for hit detection on double click
    const bounds = this.selectedShape.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        return false;
    }
    
    // Groups cannot be edited with the pen tool directly.
    if (this.selectedShape instanceof Two.Group) {
      return false;
    }

    // Convert primitive shapes to an editable path upon entering edit mode.
    if (!(this.selectedShape instanceof Two.Path)) {
        this.flattenSelectedShape();
    }

    // If we have a path (either pre-existing or just converted), switch to Pen tool.
    if (this.selectedShape instanceof Two.Path) {
        this.penPath = this.selectedShape;
        this.setTool('pen');
        this.onToolChange?.('pen'); // Notify React UI of the tool change.
        this.updateAnchorSelection(0); // Default to selecting the first anchor.
        this.updatePenHelpers(); // Display the anchors and handles.
        return true; // Successfully entered edit mode.
    }

    return false;
  }

  // --- IO & THUMBNAILS ---

  public generateThumbnail(layerId: string) {
    const group = this.groups.get(layerId);
    if (!group) return;
    const clone = group.clone();
    clone.translation.set(0, 0); clone.scale = 1; clone.rotation = 0;
    this.thumbTwo.clear(); this.thumbTwo.add(clone);
    const bounds = clone.getBoundingClientRect();
    const maxDim = Math.max(bounds.width, bounds.height);
    if (maxDim > 0) {
      const scale = (this.thumbTwo.width - 10) / maxDim;
      clone.scale = scale;
      const bbox = clone.getBoundingClientRect();
      const bx = bbox.left + bbox.width / 2;
      const by = bbox.top + bbox.height / 2;
      clone.translation.addSelf(new Two.Vector((this.thumbTwo.width / 2) - bx, (this.thumbTwo.height / 2) - by));
    }
    this.thumbTwo.render();
    this.onThumbnailReady?.(layerId, this.thumbTwo.renderer.domElement.toDataURL('image/png', 0.5));
  }

  public importSVG(svgString: string) {
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    this.two.load(svgString, (loadedGroup: Two.Group) => {
      if (loadedGroup) {
        (loadedGroup as any).children.forEach((child: any) => {
          if (child instanceof Two.Shape) {
            if (child.fill === undefined || child.fill === 'none') child.fill = 'black';
            if (child.stroke === undefined) child.stroke = 'transparent';
          }
        });
        loadedGroup.center();
        loadedGroup.translation.set(0, 0);
        group.add(loadedGroup);
        this.selectShape(loadedGroup);
        this.generateThumbnail(this.activeLayerId!);
      }
    });
  }

  // --- INTERACTION ---

  public handleDown(rawX: number, rawY: number) {
    const now = Date.now();
    if (now - this.lastClickTime < 300) {
      if (this.tool === 'pen') { this.finishPath(); this.lastClickTime = 0; return; }
      if (this.tool === 'select' && this.selectedShape) {
          if (this.tryEnterEditMode(rawX, rawY)) { this.lastClickTime = 0; return; }
      }
    }
    this.lastClickTime = now;

    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive) {
      this.isInteracting = true;
      const local = this.toLocal(this.buildState.container!, rawX, rawY);
      this.buildState.lassoPoints = []; 
      if (this.buildState.lassoPath) this.buildState.lassoPath.vertices = [];
      this.updateBuildLasso(local.x, local.y);
      return;
    }

    this.isInteracting = true;
    if (this.tool === 'delete') {
      this.handleDelete(group, rawX, rawY);
    } else if (this.tool === 'select') {
      this.handleSelect(group, rawX, rawY);
    } else if (this.tool === 'pen') {
      this.handlePenDown(rawX, rawY, group);
    } else if (this.tool === 'brush') {
      const local = this.toLocal(group, rawX, rawY);
      this.handleBrushDown(local.x, local.y, group);
    } else if (this.tool === 'shape') {
      const local = this.toLocal(group, rawX, rawY);
      this.handleShapeDown(local.x, local.y, group);
    }
  }

  public handleMove(rawX: number, rawY: number) {
    if (!this.isInteracting) return;
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive) {
      const local = this.toLocal(this.buildState.container!, rawX, rawY);
      this.updateBuildLasso(local.x, local.y);
    } else if (this.tool === 'select' && this.selectedShape) {
      const local = this.toLocal(this.selectedShape.parent, rawX, rawY);
      this.selectedShape.translation.set(local.x - this.dragOffset.x, local.y - this.dragOffset.y);
      this.updateSelectionHandles();
      this.onSelectionPropertiesChange?.({ selectionX: this.selectedShape.translation.x, selectionY: this.selectedShape.translation.y });
    } else if (this.tool === 'brush' && this.currentPath) {
      const local = this.toLocal(this.currentPath.parent, rawX, rawY);
      this.currentPath.vertices.push(new Two.Anchor(local.x, local.y));
    } else if (this.tool === 'pen') { 
      this.handlePenMove(rawX, rawY); 
    } else if (this.tool === 'shape') { 
      const local = this.toLocal(this.tempShape ? this.tempShape.parent : group, rawX, rawY);
      this.handleShapeMove(local.x, local.y); 
    }
  }

  public handleUp() {
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive && this.isInteracting) {
      this.finalizeBuild();
    }
    if (this.isInteracting && this.activeLayerId) this.generateThumbnail(this.activeLayerId);
    this.isInteracting = false; 
    this.currentPath = null;
    if (this.tool === 'pen' && (this.penInteraction.mode !== 'idle')) {
      this.penInteraction.mode = 'idle';
    } else if (this.tool === 'shape') {
      this.handleShapeUp();
    }
  }

  // --- INTERACTION LOGIC ---

  private handleDelete(group: Two.Group, rawX: number, rawY: number) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (!(child instanceof Two.Shape) || !child.visible) continue;
      const bounds = child.getBoundingClientRect();
      if (rawX >= bounds.left && rawX <= bounds.right && rawY >= bounds.top && rawY <= bounds.bottom) {
        child.remove();
        if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
        break;
      }
    }
  }

  private handleSelect(group: Two.Group, rawX: number, rawY: number) {
    this.selectedShape = null;
    let found = false;

    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (!(child instanceof Two.Shape) || !child.visible) continue;

      const bounds = child.getBoundingClientRect();
      if (rawX >= bounds.left && rawX <= bounds.right && rawY >= bounds.top && rawY <= bounds.bottom) {
        this.selectShape(child);
        const localToParent = this.toLocal(child.parent, rawX, rawY);
        this.dragOffset = { x: localToParent.x - child.translation.x, y: localToParent.y - child.translation.y };
        found = true;
        break;
      }
    }

    if (!found) {
      this.onSelectionTypeChange?.(null);
    }
    this.updateSelectionHandles();
  }
  
  private selectShape(shape: any) {
    this.selectedShape = shape;
    this.updateSelectionHandles();
    this.broadcastSelectionType(shape);
    this.broadcastSelectionProperties(shape);
  }

  private broadcastSelectionProperties(shape: any) {
    let sample = shape instanceof Two.Group && shape.children.length > 0 ? shape.children[0] : shape;
    const stroke = sample.stroke, fill = sample.fill;
    const props: Partial<ToolSettings> = {
      strokeEnabled: stroke !== 'transparent',
      strokeColor: stroke === 'transparent' ? this.settings.strokeColor : (typeof stroke === 'string' ? stroke : (stroke as any).toHexString?.() || this.settings.strokeColor),
      fillEnabled: fill !== 'transparent',
      fillColor: fill === 'transparent' ? this.settings.fillColor : (typeof fill === 'string' ? fill : (fill as any).toHexString?.() || this.settings.fillColor),
      strokeWidth: sample.linewidth || this.settings.strokeWidth,
      selectionX: shape.translation.x,
      selectionY: shape.translation.y,
      selectionRotation: (shape.rotation * 180) / Math.PI,
      selectionScale: typeof shape.scale === 'number' ? shape.scale : (shape.scale.x || 1),
    };
    if (sample._isRoundedRect) props.cornerRadius = sample._cornerRadius;
    if (sample instanceof Two.Star) { props.starPoints = sample.sides; props.starInnerRadius = sample.outerRadius > 0 ? sample.innerRadius / sample.outerRadius : 0.5; }
    if (sample instanceof Two.Polygon) props.polygonSides = sample.sides;
    this.onSelectionPropertiesChange?.(props);
  }

  private broadcastSelectionType(shape: any) {
    let type: SelectedObjectType = null;
    if (shape instanceof Two.Group) type = 'group';
    else if (shape._isRoundedRect) type = 'rectangle';
    else if (shape instanceof Two.Star) type = 'star';
    else if (shape instanceof Two.Polygon) type = 'polygon';
    else if (shape instanceof Two.Ellipse) type = 'ellipse';
    else if (shape instanceof Two.Line) type = 'line';
    else if (shape instanceof Two.Path) type = 'path';
    else if (shape instanceof Two.Rectangle) type = 'rectangle';
    this.onSelectionTypeChange?.(type);
  }

  private updateSelectionHandles() {
    if (this.transformGroup) { this.two.remove(this.transformGroup); this.transformGroup = null; }
    if (!this.selectedShape || this.tool !== 'select') return;
    
    this.two.update(); 
    const bounds = this.selectedShape.getBoundingClientRect();
    const group = new Two.Group(); 
    this.transformGroup = group;
    
    const cx = bounds.left + bounds.width/2 - this.two.width/2;
    const cy = bounds.top + bounds.height/2 - this.two.height/2;
    
    const rect = new Two.Rectangle(cx, cy, bounds.width + 10, bounds.height + 10);
    rect.noFill(); 
    rect.stroke = '#1565C0'; 
    rect.linewidth = 2; 
    group.add(rect);

    const handlePoints = [
        {x: bounds.left - 5 - this.two.width/2, y: bounds.top - 5 - this.two.height/2},
        {x: bounds.right + 5 - this.two.width/2, y: bounds.top - 5 - this.two.height/2},
        {x: bounds.right + 5 - this.two.width/2, y: bounds.bottom + 5 - this.two.height/2},
        {x: bounds.left - 5 - this.two.width/2, y: bounds.bottom + 5 - this.two.height/2}
    ];

    handlePoints.forEach(p => {
      const h = new Two.Circle(p.x, p.y, 5); 
      h.fill = '#FFFFFF'; 
      h.stroke = '#1565C0'; 
      h.linewidth = 1; 
      group.add(h);
    });

    this.two.scene.add(group);
  }

  // --- PEN TOOL LOGIC ---

  private handlePenDown(rawX: number, rawY: number, group: Two.Group) {
    const HIT = 12;
    if (this.penPath && this.selectedAnchorIdx !== -1) {
      const v = this.penPath.vertices[this.selectedAnchorIdx];
      if (v && v.controls) {
        const local = this.toLocal(this.penPath.parent, rawX, rawY);
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y;
        const rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        if (Math.hypot(local.x - lx, local.y - ly) < HIT) { this.penInteraction = { mode: 'dragging-handle-left', dragStart: {x: local.x, y: local.y}, initialPos: {x: lx, y: ly} }; return; }
        if (Math.hypot(local.x - rx, local.y - ry) < HIT) { this.penInteraction = { mode: 'dragging-handle-right', dragStart: {x: local.x, y: local.y}, initialPos: {x: rx, y: ry} }; return; }
      }
    }
    if (this.penPath) {
      const local = this.toLocal(this.penPath.parent, rawX, rawY);
      for (let i = 0; i < this.penPath.vertices.length; i++) {
        if (Math.hypot(local.x - this.penPath.vertices[i].x, local.y - this.penPath.vertices[i].y) < HIT) {
          if (i === 0 && this.penPath.vertices.length > 2 && !this.penPath.closed) { this.penPath.closed = true; this.finishPath(); return; }
          this.updateAnchorSelection(i); 
          this.penInteraction = { 
            mode: 'dragging-anchor', 
            dragStart: {x: local.x, y: local.y}, 
            initialPos: {x: this.penPath.vertices[i].x, y: this.penPath.vertices[i].y} 
          }; 
          return;
        }
      }
    }
    
    if (!this.penPath || this.penPath.closed) {
      const path = new Two.Path([], false, true, true);
      path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000'; 
      path.linewidth = this.settings.strokeWidth; 
      path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
      group.add(path); this.penPath = path;
      const local = this.toLocal(group, rawX, rawY);
      path.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      this.updateAnchorSelection(0);
      this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    } else {
      const local = this.toLocal(group, rawX, rawY);
      this.penPath.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      this.updateAnchorSelection(this.penPath.vertices.length - 1);
      this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    }
    this.updatePenHelpers();
  }

  private handlePenMove(rawX: number, rawY: number) {
    if (!this.penPath || this.penInteraction.mode === 'idle' || !this.penPath.parent) return;
    const local = this.toLocal(this.penPath.parent, rawX, rawY);
    const v = this.penPath.vertices[this.selectedAnchorIdx]; 
    if (!v || !v.controls) return;
    
    if (this.penInteraction.mode === 'creating') {
      const dx = local.x - v.x, dy = local.y - v.y; 
      v.controls.right.set(dx, dy); 
      v.controls.left.set(-dx, -dy);
    } else if (this.penInteraction.mode === 'dragging-anchor') {
      v.x = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
      v.y = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
    } else if (this.penInteraction.mode === 'dragging-handle-left') {
      const dx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x) - v.x;
      const dy = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y) - v.y;
      v.controls.left.set(dx, dy); 
      if (this.settings.penHandleMode === 'mirrored') v.controls.right.set(-dx, -dy);
    } else if (this.penInteraction.mode === 'dragging-handle-right') {
      const dx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x) - v.x;
      const dy = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y) - v.y;
      v.controls.right.set(dx, dy); 
      if (this.settings.penHandleMode === 'mirrored') v.controls.left.set(-dx, -dy);
    }
    this.updatePenHelpers();
  }

  private updatePenHelpers() {
    if (this.penHelpers) this.two.remove(this.penHelpers); 
    if (!this.penPath || this.tool !== 'pen') return;
    
    const h = new Two.Group(); 
    this.penHelpers = h;
    const matrix = this.getGlobalMatrix(this.penPath);
    const sceneMatrixInv = (this.getGlobalMatrix(this.two.scene).clone() as any).inverse();
    if (sceneMatrixInv) {
        const localToScene = sceneMatrixInv.clone().multiply(matrix);
        h.matrix.copy(localToScene);
    }
    
    this.penPath.vertices.forEach((v: any, i: number) => {
      const sel = i === this.selectedAnchorIdx;
      const c = new Two.Circle(v.x, v.y, sel ? 6 : 4); 
      c.fill = sel ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF'); 
      c.stroke = '#1565C0'; 
      h.add(c);
      if (sel && v.controls) {
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y, rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        const lL = new Two.Line(v.x, v.y, lx, ly), lR = new Two.Line(v.x, v.y, rx, ry); 
        lL.stroke = lR.stroke = '#1565C0'; 
        h.add(lL, lR);
        const cL = new Two.Circle(lx, ly, 4), cR = new Two.Circle(rx, ry, 4); 
        cL.fill = cR.fill = '#FFFFFF'; 
        cL.stroke = '#1565C0'; 
        h.add(cL, cR);
      }
    });
    this.two.scene.add(h);
  }

  // --- PEN API ---
  
  public setPathClosed(closed: boolean) {
    if (this.penPath) {
      this.penPath.closed = closed;
      this.updatePenHelpers();
    }
  }

  public deleteSelectedAnchor() {
    if (!this.penPath || this.selectedAnchorIdx === -1) return;
    if (this.penPath.vertices.length <= 2) {
      this.penPath.remove();
      this.penPath = null;
      this.updateAnchorSelection(-1);
    } else {
      this.penPath.vertices.splice(this.selectedAnchorIdx, 1);
      this.updateAnchorSelection(Math.max(0, this.selectedAnchorIdx - 1));
    }
    this.updatePenHelpers();
    if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
  }

  public setAnchorSharp() {
    if (!this.penPath || this.selectedAnchorIdx === -1) return;
    const v = this.penPath.vertices[this.selectedAnchorIdx];
    if (v && v.controls) {
      v.controls.left.set(0, 0);
      v.controls.right.set(0, 0);
      this.updatePenHelpers();
      if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
    }
  }

  // --- PRIMITIVES & BUILD ---

  private handleShapeDown(localX: number, localY: number, group: Two.Group) {
    if (this.settings.shapeMode === 'build') return;
    this.shapeOrigin = { x: localX, y: localY };
    let s: any;
    if (this.settings.shapeType === 'rectangle') { 
      this.tempShape = new Two.Group(); 
      group.add(this.tempShape); 
      this.handleShapeMove(localX, localY); 
      return; 
    }
    else if (this.settings.shapeType === 'ellipse') s = new Two.Ellipse(localX, localY, 0, 0);
    else if (this.settings.shapeType === 'star') s = new Two.Star(localX, localY, 0, 0, this.settings.starPoints);
    else if (this.settings.shapeType === 'polygon') s = new Two.Polygon(localX, localY, 0, this.settings.polygonSides);
    else if (this.settings.shapeType === 'line') s = new Two.Line(localX, localY, localX, localY);
    
    if (s) { 
      s.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent'; 
      s.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent'; 
      s.linewidth = this.settings.strokeWidth; 
      group.add(s); 
      this.tempShape = s; 
    }
  }

  private handleShapeMove(localX: number, localY: number) {
    if (!this.tempShape || this.settings.shapeMode === 'build') return;
    if (this.tempShape instanceof Two.Line) { 
      this.tempShape.vertices[1].x = localX; 
      this.tempShape.vertices[1].y = localY; 
      return; 
    }
    const w = Math.abs(localX - this.shapeOrigin.x), h = Math.abs(localY - this.shapeOrigin.y);
    const cx = (localX + this.shapeOrigin.x) / 2, cy = (localY + this.shapeOrigin.y) / 2;
    if (this.tempShape instanceof Two.Group) {
      this.tempShape.remove(this.tempShape.children);
      const r = this.two.makeRoundedRectangle(cx, cy, w, h, this.settings.cornerRadius);
      r.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent'; r.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent'; r.linewidth = this.settings.strokeWidth;
      (r as any)._isRoundedRect = true; (r as any)._cornerRadius = this.settings.cornerRadius; this.tempShape.add(r); return;
    }
    this.tempShape.translation.set(cx, cy); const rad = Math.hypot(w, h) / 2;
    if (this.tempShape instanceof Two.Ellipse) { this.tempShape.width = w; this.tempShape.height = h; }
    else if (this.tempShape instanceof Two.Star) { this.tempShape.outerRadius = rad; this.tempShape.innerRadius = rad * this.settings.starInnerRadius; }
    else if (this.tempShape instanceof Two.Polygon) (this.tempShape as any).radius = rad;
  }

  private handleShapeUp() {
    if (this.tempShape instanceof Two.Group && this.activeLayerId) {
      const r = this.tempShape.children[0];
      if (r) { this.tempShape.remove(r); this.groups.get(this.activeLayerId)?.add(r); }
      this.tempShape.remove();
    }
    this.tempShape = null;
  }

  // --- UTILS ---

  public finishPath() { 
    this.penPath = null; 
    this.updateAnchorSelection(-1); 
    if (this.penHelpers) this.two.remove(this.penHelpers); 
    this.penHelpers = null; 
    this.penInteraction.mode = 'idle'; 
  }

  private updateAnchorSelection(idx: number) { 
    this.selectedAnchorIdx = idx; 
    this.onAnchorSelect?.(idx !== -1); 
    if (idx !== -1) {
      this.broadcastSelectionType(this.penPath);
      this.broadcastSelectionProperties(this.penPath);
    }
  }

  private applySettingsToShape(s: any) {
    const leaf = (o: any) => {
        o.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
        o.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
        o.linewidth = this.settings.strokeWidth;
        if ('cap' in o) o.cap = this.settings.lineCap;
        if ('join' in o) o.join = this.settings.lineJoin;
    };
    if (s instanceof Two.Group) s.children.forEach((c: any) => leaf(c)); 
    else leaf(s);
  }

  public duplicateLayerContent(originalId: string, newId: string) {
    const original = this.groups.get(originalId);
    if (!original) return;
    const copy = original.clone();
    copy.id = newId;
    this.groups.set(newId, copy);
  }

  public ungroupSelected() {
    if (!this.selectedShape || !(this.selectedShape instanceof Two.Group)) return;
    const group = this.selectedShape;
    const parent = group.parent;
    if (!parent) return;

    const children = [...group.children];
    children.forEach(child => {
      const matrix = this.getGlobalMatrix(child);
      const parentMatrixInv = (this.getGlobalMatrix(parent).clone() as any).inverse();
      child.remove();
      parent.add(child);
      if (parentMatrixInv) {
          child.matrix.copy(parentMatrixInv.multiply(matrix));
      }
    });
    group.remove();
    this.selectedShape = null;
    this.updateSelectionHandles();
    if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
  }
  
  private getPathInWorldCoords(shape: any): Two.Path | null {
    if (!(shape instanceof Two.Shape)) return null;
    let path: Two.Path;
    if (shape instanceof Two.Path) {
      path = shape.clone();
    } else if (typeof shape.toPath === 'function') {
      path = shape.toPath((shape as any).closed !== false);
      path.fill = shape.fill; path.stroke = shape.stroke; path.linewidth = shape.linewidth;
    } else {
      return null;
    }
    const worldMatrix = this.getGlobalMatrix(shape);
    path.vertices.forEach(v => {
      const p = worldMatrix.multiply(v.x, v.y, 1);
      if (v.controls) {
        const l = worldMatrix.multiply(v.x + v.controls.left.x, v.y + v.controls.left.y, 1);
        v.controls.left.set(l.x - p.x, l.y - p.y);
        const r = worldMatrix.multiply(v.x + v.controls.right.x, v.y + v.controls.right.y, 1);
        v.controls.right.set(r.x - p.x, r.y - p.y);
      }
      v.set(p.x, p.y);
    });
    path.matrix.identity();
    return path;
  }

  private enterBuildMode() {
    this.exitBuildMode();
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group || group.children.length === 0) return;
    this.buildState.isActive = true;
    this.buildState.container = new Two.Group();
    this.two.scene.add(this.buildState.container);
    this.buildState.originalShapes = [...group.children];
    this.buildState.shards = this.buildState.originalShapes.map(s => ({ two: s.clone() }));

    this.buildState.shards.forEach(shard => {
        const applyShardStyle = (s: any) => {
            if (s instanceof Two.Group) s.children.forEach(applyShardStyle);
            else { s.fill = '#007bff33'; s.stroke = '#007bff'; s.linewidth = 1; }
        };
        applyShardStyle(shard.two);
        this.buildState.container!.add(shard.two);
    });

    this.buildState.originalShapes.forEach(s => s.visible = false);
    this.buildState.lassoPath = new Two.Path([], false, false, true);
    this.buildState.lassoPath.fill = '#007bff22'; this.buildState.lassoPath.stroke = '#007bff';
    this.buildState.lassoPath.linewidth = 1; this.buildState.lassoPath.dashes = [4, 4];
    this.buildState.container!.add(this.buildState.lassoPath);
  }

  private exitBuildMode() { 
    if (!this.buildState.isActive) return;
    this.buildState.isActive = false; 
    this.buildState.container?.remove(); 
    this.buildState.originalShapes.forEach(s => s.visible = true);
    this.buildState.shards = []; this.buildState.originalShapes = [];
    this.buildState.container = null; this.buildState.lassoPath = null;
  }

  private updateBuildLasso(x: number, y: number) {
      if (!this.buildState.lassoPath) return;
      this.buildState.lassoPoints.push({x, y});
      this.buildState.lassoPath.vertices.push(new Two.Anchor(x, y));
  }
  
  private finalizeBuild() {
    if (!this.buildState.isActive || !this.activeLayerId || this.buildState.lassoPoints.length < 3) { this.enterBuildMode(); return; }
    const group = this.groups.get(this.activeLayerId); if (!group) return;
    
    const lassoTwo = new Two.Path(this.buildState.lassoPoints.map(p => new Two.Anchor(p.x, p.y)), true);
    
    const selectedClones: Two.Shape[] = [];
    const unselectedClones: Two.Shape[] = [];

    this.buildState.shards.forEach((shard, i) => {
      const worldShard = this.getPathInWorldCoords(this.buildState.originalShapes[i]);
      if (worldShard) {
        const intersectionResult = Two.Path.intersect(worldShard, lassoTwo);
        if (intersectionResult.children.length > 0) {
          selectedClones.push(this.buildState.originalShapes[i]);
        } else {
          unselectedClones.push(this.buildState.originalShapes[i]);
        }
        intersectionResult.remove();
      } else {
        unselectedClones.push(this.buildState.originalShapes[i]);
      }
    });

    if (selectedClones.length === 0) { this.enterBuildMode(); return; }

    group.remove(...group.children); 

    let finalResult: Two.Group;

    if (this.settings.buildMode === 'add') {
      if (selectedClones.length > 1) {
        const selectedAsWorld = selectedClones.map(s => this.getPathInWorldCoords(s)).filter(p => p) as Two.Path[];
        let combined = selectedAsWorld[0];
        for (let i = 1; i < selectedAsWorld.length; i++) {
          combined = Two.Path.union(combined, selectedAsWorld[i]);
        }
        finalResult = combined;
      } else {
        finalResult = new Two.Group();
        finalResult.add(selectedClones[0].clone());
      }
      unselectedClones.forEach(s => finalResult.add(s.clone()));
    } else { // subtract
      finalResult = new Two.Group();
      unselectedClones.forEach(s => finalResult.add(s.clone()));
    }

    const parentMatrixInv = this.getGlobalMatrix(group).clone().inverse();
    finalResult.children.forEach(shape => {
      if (parentMatrixInv) { shape.matrix.premultiply(parentMatrixInv); }
      const applyFinalStyle = (s: any) => {
          if (s instanceof Two.Group) s.children.forEach(applyFinalStyle);
          else if (s instanceof Two.Shape) { s.fill = this.settings.fillColor; s.stroke = this.settings.strokeColor; s.linewidth = this.settings.strokeWidth; }
      };
      applyFinalStyle(shape); 
      group.add(shape);
    });
    
    this.exitBuildMode();
    this.enterBuildMode();
  }

  private handleBrushDown(x: number, y: number, group: Two.Group) {
      const p = new Two.Path([new Two.Anchor(x, y)], false, true);
      p.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000';
      p.linewidth = this.settings.strokeWidth; p.fill = 'transparent';
      group.add(p); this.currentPath = p;
  }
  
  public flattenSelectedShape() {
      if (!this.selectedShape) return;
      const s = this.selectedShape; const parent = s.parent; if (!parent) return;
      const isPrimitive = s instanceof Two.Rectangle || s instanceof Two.Ellipse || s instanceof Two.Polygon || s instanceof Two.Star || s instanceof Two.Line || s._isRoundedRect;
      if (s instanceof Two.Path && !isPrimitive) return;
      let path: any;
      if (typeof s.toPath === 'function') { const isClosed = s.closed !== undefined ? s.closed : true; path = s.toPath(isClosed); } 
      else if (s instanceof Two.Path) { path = s.clone(); } else return;
      path.matrix.copy(s.matrix); path.fill = s.fill; path.stroke = s.stroke;
      path.linewidth = s.linewidth; path.opacity = s.opacity; path.visible = s.visible;
      path.cap = s.cap; path.join = s.join;
      parent.add(path); s.remove(); this.selectShape(path);
      if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
  }

  public destroy() { this.two.pause(); this.two.renderer.domElement.remove(); this.thumbTwo.renderer.domElement.remove(); }
}