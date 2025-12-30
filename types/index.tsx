
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Window Management ---
export type WindowId = 'properties' | 'assets' | 'layers';

export interface WindowState {
  id: WindowId;
  title: string;
  isOpen: boolean;
  zIndex: number;
  x: number;
  y: number;
}

// --- Canvas & Layering ---
export type BlendMode = 
  | 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' 
  | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' 
  | 'soft-light' | 'difference' | 'exclusion' | 'hue' 
  | 'saturation' | 'color' | 'luminosity';

export interface Layer {
    id: string;
    name: string;
    isVisible: boolean;
    opacity: number;
    blendMode: BlendMode;
}

// --- Tooling ---
export type Tool = 'select' | 'brush' | 'eraser' | 'fill' | 'pen';

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'bevel' | 'round' | 'miter';

export interface ToolSettings {
    strokeColor: string;
    fillColor: string;
    strokeWidth: number;
    opacity: number;
    lineCap: LineCap;
    lineJoin: LineJoin;
    strokeEnabled: boolean;
    fillEnabled: boolean;
}

// --- Engine Events ---
export interface SelectionState {
  layerId: string | null;
  shapeId: string | null;
  type: 'path' | 'group' | 'none';
}

// FIX: Add LogEntry type for console logs
export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
}

// FIX: Add Button types for props and centralize them
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
export type ButtonSize = 'S' | 'M' | 'L';

export interface MetaButtonProps {
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  icon: string;
  customRadius: string;
  customFill?: string;
  customColor?: string;
  disabled: boolean;
  forcedHover: boolean;
  forcedFocus: boolean;
  forcedActive: boolean;
}
