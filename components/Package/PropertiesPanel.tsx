
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { useTheme } from '../../Theme.tsx';
import { ToolSettings, Layer } from '../../types/index.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import Select from '../Core/Select.tsx';
import Toggle from '../Core/Toggle.tsx';
import Input from '../Core/Input.tsx';
import { useMotionValue, motion, AnimatePresence } from 'framer-motion';

interface PropertiesPanelProps {
  toolSettings: ToolSettings;
  onSettingChange: (key: keyof ToolSettings, value: any) => void;
  activeLayer: Layer | null;
  onLayerUpdate: (id: string, properties: Partial<Layer>) => void;
}

type Tab = 'tool' | 'layer' | 'canvas';

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  toolSettings, 
  onSettingChange, 
  activeLayer,
  onLayerUpdate
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('tool');
  
  // FIX: All hooks must be at the top level to avoid Error 310
  const strokeWidthValue = useMotionValue(toolSettings.strokeWidth);
  const opacityValue = useMotionValue(activeLayer ? activeLayer.opacity * 100 : 100);

  // Sync stroke width motion value with props
  useEffect(() => {
    strokeWidthValue.set(toolSettings.strokeWidth);
  }, [toolSettings.strokeWidth, strokeWidthValue]);

  // Sync opacity motion value when activeLayer changes
  useEffect(() => {
    if (activeLayer) {
      opacityValue.set(activeLayer.opacity * 100);
    }
  }, [activeLayer, opacityValue]);

  const groupStyle: React.CSSProperties = {
    backgroundColor: theme.Color.Base.Surface[2], 
    padding: theme.spacing['Space.M'], 
    borderRadius: theme.radius['Radius.M'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing['Space.S']
  };

  const tabs: { id: Tab, label: string, icon: string }[] = [
    { id: 'tool', label: 'Tool', icon: 'ph-wrench' },
    { id: 'layer', label: 'Layer', icon: 'ph-stack' },
    { id: 'canvas', label: 'Canvas', icon: 'ph-bounding-box' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], height: '100%' }}>
      
      {/* Tab Navigation */}
      <div style={{ 
          display: 'flex', 
          backgroundColor: theme.Color.Base.Surface[2], 
          borderRadius: theme.radius['Radius.M'],
          padding: '4px',
          gap: '4px',
          border: `1px solid ${theme.Color.Base.Surface[3]}`,
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: theme.radius['Radius.S'],
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: activeTab === tab.id ? theme.Color.Accent.Surface[1] : 'transparent',
              color: activeTab === tab.id ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[2],
              transition: 'all 0.2s ease',
              ...theme.Type.Readable.Label.S,
            }}
          >
            <i className={`ph-bold ${tab.icon}`} />
            <span style={{ display: activeTab === tab.id ? 'inline' : 'none' }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, position: 'relative' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'tool' && (
            <motion.div
              key="tool"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}
            >
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
            </motion.div>
          )}

          {activeTab === 'layer' && (
            <motion.div
              key="layer"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}
            >
              {activeLayer ? (
                <>
                  <Input 
                    label="Layer Name"
                    value={activeLayer.name}
                    onChange={(e) => onLayerUpdate(activeLayer.id, { name: e.target.value })}
                  />
                  <div style={groupStyle}>
                    <Toggle 
                      label="Visible"
                      isOn={activeLayer.isVisible}
                      onToggle={() => onLayerUpdate(activeLayer.id, { isVisible: !activeLayer.isVisible })}
                    />
                  </div>
                  <Select 
                    label="Blend Mode"
                    value={activeLayer.blendMode}
                    onChange={(e) => onLayerUpdate(activeLayer.id, { blendMode: e.target.value })}
                    options={[
                      { value: 'source-over', label: 'Normal' },
                      { value: 'multiply', label: 'Multiply' },
                      { value: 'screen', label: 'Screen' },
                      { value: 'overlay', label: 'Overlay' },
                      { value: 'darken', label: 'Darken' },
                      { value: 'lighten', label: 'Lighten' },
                    ]}
                  />
                  <RangeSlider 
                    label="Opacity"
                    motionValue={opacityValue}
                    onCommit={(v) => onLayerUpdate(activeLayer.id, { opacity: v / 100 })}
                    min={0}
                    max={100}
                  />
                </>
              ) : (
                <div style={{ ...theme.Type.Readable.Body.S, color: theme.Color.Base.Content[3], textAlign: 'center', padding: '40px 0' }}>
                  No layer selected
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'canvas' && (
            <motion.div
              key="canvas"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}
            >
              <div style={groupStyle}>
                 <p style={{ ...theme.Type.Readable.Label.S, color: theme.Color.Base.Content[2], margin: 0 }}>Global controls coming soon...</p>
                 <Select 
                    label="Artboard Presets"
                    value="1080p"
                    onChange={() => {}}
                    options={[
                      { value: '1080p', label: '1920 x 1080 (16:9)' },
                      { value: '4k', label: '3840 x 2160 (16:9)' },
                      { value: 'square', label: '1024 x 1024 (1:1)' },
                    ]}
                 />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
export default PropertiesPanel;
