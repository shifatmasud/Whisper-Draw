
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { useTheme } from '../../Theme.tsx';
import { ToolSettings, Layer, Tool } from '../../types/index.tsx';
import ColorPicker from '../Core/ColorPicker.tsx';
import RangeSlider from '../Core/RangeSlider.tsx';
import Select from '../Core/Select.tsx';
import Toggle from '../Core/Toggle.tsx';
import Input from '../Core/Input.tsx';
import Button from '../Core/Button.tsx';
import { useMotionValue, motion, AnimatePresence } from 'framer-motion';

interface PropertiesPanelProps {
  toolSettings: ToolSettings;
  onSettingChange: (key: keyof ToolSettings, value: any) => void;
  activeLayer: Layer | null;
  onLayerUpdate: (id: string, properties: Partial<Layer>) => void;
  activeTool: Tool;
  isAnchorSelected?: boolean;
  onPenAction?: (action: string) => void;
}

type Tab = 'tool' | 'layer' | 'canvas';

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  toolSettings, 
  onSettingChange, 
  activeLayer,
  onLayerUpdate,
  activeTool,
  isAnchorSelected,
  onPenAction
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('tool');
  
  // FIX: All hooks must be at the top level to avoid Error 310
  const strokeWidthValue = useMotionValue(toolSettings.strokeWidth);
  const opacityValue = useMotionValue(activeLayer ? activeLayer.opacity * 100 : 100);
  const scaleValue = useMotionValue(activeLayer ? activeLayer.scale : 1);
  const rotationValue = useMotionValue(activeLayer ? activeLayer.rotation : 0);

  // Sync stroke width motion value with props
  useEffect(() => {
    strokeWidthValue.set(toolSettings.strokeWidth);
  }, [toolSettings.strokeWidth, strokeWidthValue]);

  // Sync active layer property motion values when activeLayer changes
  useEffect(() => {
    if (activeLayer) {
      opacityValue.set(activeLayer.opacity * 100);
      scaleValue.set(activeLayer.scale);
      rotationValue.set(activeLayer.rotation);
    }
  }, [activeLayer, opacityValue, scaleValue, rotationValue]);

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
              {activeTool === 'select' && (
                  <div style={groupStyle}>
                      <Select 
                          label="Selection Mode"
                          value={toolSettings.selectionMode}
                          onChange={(e) => onSettingChange('selectionMode', e.target.value)}
                          options={[
                              { value: 'vector', label: 'Vector (Deep Select)' },
                              { value: 'layer', label: 'Layer (Group Select)' },
                          ]}
                      />
                  </div>
              )}

              {activeTool === 'pen' ? (
                <>
                    <div style={{ ...groupStyle, borderColor: theme.Color.Success.Content[1] }}>
                         <label style={{ ...theme.Type.Readable.Label.S, color: theme.Color.Success.Content[1] }}>PATH ACTIONS</label>
                         <Button 
                            label="Finish Editing" 
                            variant="primary" 
                            size="M" 
                            icon="ph-check" 
                            customFill={theme.Color.Success.Content[1]}
                            onClick={() => onPenAction && onPenAction('finishPath')} 
                         />
                         <Toggle 
                             label="Close Path" 
                             isOn={toolSettings.penClosePath} 
                             onToggle={() => onSettingChange('penClosePath', !toolSettings.penClosePath)} 
                         />
                    </div>
                    
                    {isAnchorSelected && (
                        <div style={groupStyle}>
                             <label style={{ ...theme.Type.Readable.Label.S, color: theme.Color.Base.Content[2] }}>ANCHOR POINT</label>
                             <div style={{ display: 'flex', gap: '8px' }}>
                                 <Button 
                                    label="Delete" 
                                    variant="secondary" 
                                    size="S" 
                                    icon="ph-trash" 
                                    customColor={theme.Color.Error.Content[1]}
                                    onClick={() => onPenAction && onPenAction('deleteAnchor')} 
                                 />
                                 <Button 
                                    label="Sharp" 
                                    variant="secondary" 
                                    size="S" 
                                    icon="ph-corners-out" 
                                    onClick={() => onPenAction && onPenAction('sharpAnchor')} 
                                 />
                             </div>
                             <Select 
                                label="Handle Mode"
                                value={toolSettings.penHandleMode}
                                onChange={(e) => onSettingChange('penHandleMode', e.target.value)}
                                options={[
                                    { value: 'mirrored', label: '2 Handles (Mirrored)' },
                                    { value: 'disconnected', label: '1 Handle (Broken)' },
                                ]}
                             />
                        </div>
                    )}
                </>
              ) : null}

              {activeTool !== 'select' && activeTool !== 'delete' && (
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
              )}

              {activeTool !== 'select' && activeTool !== 'delete' && (
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
              )}

              {activeTool !== 'select' && activeTool !== 'delete' && (
                  <>
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
                  </>
              )}
              
              {activeTool === 'delete' && (
                  <div style={groupStyle}>
                      <p style={{...theme.Type.Readable.Body.S, margin: 0}}>Click on any object or path to remove it.</p>
                  </div>
              )}
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
                  
                  {/* Transform Controls */}
                  <div style={groupStyle}>
                      <label style={{ ...theme.Type.Readable.Label.S, color: theme.Color.Base.Content[2] }}>TRANSFORM</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing['Space.S'] }}>
                          <Input
                              label="X Position"
                              type="number"
                              value={activeLayer.x.toString()}
                              onChange={(e) => onLayerUpdate(activeLayer.id, { x: Number(e.target.value) || 0 })}
                          />
                          <Input
                              label="Y Position"
                              type="number"
                              value={activeLayer.y.toString()}
                              onChange={(e) => onLayerUpdate(activeLayer.id, { y: Number(e.target.value) || 0 })}
                          />
                      </div>
                      <RangeSlider
                          label="Scale"
                          motionValue={scaleValue}
                          min={0.1}
                          max={3.0}
                          onCommit={(v) => onLayerUpdate(activeLayer.id, { scale: v })}
                      />
                       <RangeSlider
                          label="Rotation"
                          motionValue={rotationValue}
                          min={0}
                          max={360}
                          onCommit={(v) => onLayerUpdate(activeLayer.id, { rotation: v })}
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
