
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { useTheme } from '../../Theme.tsx';
import { ToolSettings } from '../../types/index.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import Select from '../Core/Select.tsx';
import Toggle from '../Core/Toggle.tsx';
import { useMotionValue } from 'framer-motion';

interface PropertiesPanelProps {
  toolSettings: ToolSettings;
  onSettingChange: (key: keyof ToolSettings, value: any) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ toolSettings, onSettingChange }) => {
  const { theme } = useTheme();
  
  const strokeWidthValue = useMotionValue(toolSettings.strokeWidth);

  useEffect(() => {
    const unsubscribe = strokeWidthValue.onChange(v => onSettingChange('strokeWidth', v));
    return unsubscribe;
  }, [strokeWidthValue, onSettingChange]);

  useEffect(() => {
      strokeWidthValue.set(toolSettings.strokeWidth);
  }, [toolSettings.strokeWidth, strokeWidthValue]);

  const groupStyle: React.CSSProperties = {
    backgroundColor: theme.Color.Base.Surface[2], 
    padding: theme.spacing['Space.M'], 
    borderRadius: theme.radius['Radius.M'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing['Space.S']
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}>
      
      {/* Stroke Section */}
      <div style={groupStyle}>
        <Toggle 
            label="Stroke" 
            isOn={toolSettings.strokeEnabled} 
            onToggle={() => onSettingChange('strokeEnabled', !toolSettings.strokeEnabled)} 
        />
        {toolSettings.strokeEnabled && (
            <ColorPicker
                label=""
                value={toolSettings.strokeColor}
                onChange={(e) => onSettingChange('strokeColor', e.target.value)}
            />
        )}
      </div>

      {/* Fill Section */}
      <div style={groupStyle}>
        <Toggle 
            label="Fill" 
            isOn={toolSettings.fillEnabled} 
            onToggle={() => onSettingChange('fillEnabled', !toolSettings.fillEnabled)} 
        />
        {toolSettings.fillEnabled && (
            <ColorPicker
                label=""
                value={toolSettings.fillColor}
                onChange={(e) => onSettingChange('fillColor', e.target.value)}
            />
        )}
      </div>

      <RangeSlider
        label="Stroke Width"
        motionValue={strokeWidthValue}
        onCommit={(v) => onSettingChange('strokeWidth', v)}
        min={1}
        max={100}
      />

      {/* Style Row */}
      <div style={{ display: 'flex', gap: theme.spacing['Space.M'] }}>
        <div style={{ flex: 1 }}>
          <Select 
            label="Line Cap"
            value={toolSettings.lineCap}
            onChange={(e) => onSettingChange('lineCap', e.target.value)}
            options={[
              { value: 'round', label: 'Round' },
              { value: 'butt', label: 'Butt' },
              { value: 'square', label: 'Square' },
            ]}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Select 
            label="Line Join"
            value={toolSettings.lineJoin}
            onChange={(e) => onSettingChange('lineJoin', e.target.value)}
            options={[
              { value: 'round', label: 'Round' },
              { value: 'bevel', label: 'Bevel' },
              { value: 'miter', label: 'Miter' },
            ]}
          />
        </div>
      </div>
    </div>
  );
};
export default PropertiesPanel;
