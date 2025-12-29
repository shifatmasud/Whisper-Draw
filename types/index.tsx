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
export interface Layer {
    id: string;
    name: string;
    isVisible: boolean;
    opacity: number;
    blendMode: string;
}

// --- Tooling ---
export type Tool = 'brush' | 'eraser' | 'fill';

export interface ToolSettings {
    color: string;
    size: number;
    opacity: number;
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
