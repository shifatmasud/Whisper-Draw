/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { useTheme } from '../../Theme.tsx';
import { ToolSettings } from '../../types/index.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import { useMotionValue } from 'framer-motion';

interface PropertiesPanelProps {
  toolSettings: ToolSettings;
  onSettingChange: (key: keyof ToolSettings, value: any) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ toolSettings, onSettingChange }) => {
  const { theme } = useTheme();
  
  const sizeValue = useMotionValue(toolSettings.size);

  useEffect(() => {
    const unsubscribe = sizeValue.onChange(v => onSettingChange('size', v));
    return unsubscribe;
  }, [sizeValue, onSettingChange]);

  useEffect(() => {
      sizeValue.set(toolSettings.size);
  }, [toolSettings.size, sizeValue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.L'] }}>
      <ColorPicker
        label="Color"
        value={toolSettings.color}
        onChange={(e) => onSettingChange('color', e.target.value)}
      />
      <RangeSlider
        label="Brush Size"
        motionValue={sizeValue}
        onCommit={(v) => onSettingChange('size', v)}
        min={1}
        max={100}
      />
    </div>
  );
};
export default PropertiesPanel;