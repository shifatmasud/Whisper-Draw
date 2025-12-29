/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import { hexToHsl, hslToHex, HSLColor } from '../../utils/color.tsx';
import ColorSphere from './ColorSphere.tsx';
import RangeSlider from './RangeSlider.tsx';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (e: any) => void;
  style?: React.CSSProperties;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, style }) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [hsl, setHsl] = useState<HSLColor>(hexToHsl(value));
  const hue = useMotionValue(hsl.h * 360);
  const saturation = useMotionValue(hsl.s * 100);
  const lightness = useMotionValue(hsl.l * 100);

  // Sync internal HSL state when external hex value changes
  useEffect(() => {
    const newHsl = hexToHsl(value);
    setHsl(newHsl);
    hue.set(newHsl.h * 360);
    saturation.set(newHsl.s * 100);
    lightness.set(newHsl.l * 100);
  }, [value]);

  // Update hex value when HSL motion values change
  useEffect(() => {
    const combine = () => {
      const newHex = hslToHex(hue.get() / 360, saturation.get() / 100, lightness.get() / 100);
      onChange({ target: { value: newHex } });
    };
    const unsubHue = hue.onChange(combine);
    const unsubSat = saturation.onChange(combine);
    const unsubLight = lightness.onChange(combine);
    return () => {
      unsubHue();
      unsubSat();
      unsubLight();
    };
  }, [hue, saturation, lightness, onChange]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;
    if (!input.startsWith('#')) {
      input = '#' + input;
    }
    if (/^#[0-9A-F]{6}$/i.test(input) || /^#[0-9A-F]{3}$/i.test(input)) {
       onChange({ target: { value: input } });
    }
  };
  
  const handlePresetClick = (color: string) => {
    onChange({ target: { value: color } });
  };

  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    width: '260px',
    backgroundColor: theme.Color.Base.Surface[2],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    borderRadius: theme.radius['Radius.M'],
    boxShadow: theme.effects['Effect.Shadow.Drop.3'],
    zIndex: 101,
    padding: theme.spacing['Space.M'],
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing['Space.M'],
  };

  useEffect(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (isOpen && trigger && popover) {
      const rect = trigger.getBoundingClientRect();
      popover.style.left = `${rect.left}px`;
      popover.style.top = `${rect.bottom + 8}px`; // 8px gap
    }
  }, [isOpen]);

  const swatchStyle: React.CSSProperties = {
    width: '42px',
    height: '42px',
    borderRadius: theme.radius['Radius.S'],
    backgroundColor: value,
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    cursor: 'pointer',
    flexShrink: 0,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: theme.spacing['Space.S'],
    height: '42px',
    borderRadius: theme.radius['Radius.S'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    backgroundColor: theme.Color.Base.Surface[2],
    color: theme.Color.Base.Content[1],
    fontFamily: theme.Type.Expressive.Data.fontFamily,
    fontSize: '13px',
    outline: 'none',
    textTransform: 'uppercase',
  };

  const presets = [
    '#FFFFFF', '#AAAAAA', '#555555', '#111111', '#000000',
    theme.Color.Error.Content[1], theme.Color.Warning.Content[1],
    theme.Color.Success.Content[1], theme.Color.Focus.Content[1], theme.Color.Signal.Content[1]
  ];

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <label style={{ ...theme.Type.Readable.Label.S, display: 'block', marginBottom: theme.spacing['Space.S'], color: theme.Color.Base.Content[2] }}>
        {label}
      </label>
      <div ref={triggerRef} style={{ display: 'flex', gap: theme.spacing['Space.S'] }}>
        <motion.div style={swatchStyle} onClick={() => setIsOpen(!isOpen)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} />
        <input type="text" value={value} onChange={handleHexChange} style={inputStyle} placeholder="#000000" maxLength={7} />
      </div>

      {isOpen && createPortal(
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100 }} onClick={() => setIsOpen(false)} />
          <AnimatePresence>
            <motion.div
              ref={popoverRef}
              style={popoverStyle}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], alignItems: 'center' }}>
                 <div style={{ width: '100%', height: '120px' }}><ColorSphere color={value} /></div>
                 <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {presets.map((color) => (
                        <motion.button key={color} onClick={() => handlePresetClick(color)}
                            style={{ width: '100%', aspectRatio: '1/1', borderRadius: '50%', backgroundColor: color, border: `2px solid ${value.toLowerCase() === color.toLowerCase() ? theme.Color.Base.Content[1] : 'transparent'}`, cursor: 'pointer' }}
                            whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} />
                    ))}
                 </div>
              </div>

              <div style={{ borderTop: `1px solid ${theme.Color.Base.Surface[3]}`, margin: `${theme.spacing['Space.S']} 0` }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M']}}>
                <RangeSlider label="Hue" motionValue={hue} onCommit={() => {}} min={0} max={360} trackBackground="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" />
                <RangeSlider label="Saturation" motionValue={saturation} onCommit={() => {}} min={0} max={100} trackBackground={`linear-gradient(to right, #808080, ${hslToHex(hsl.h, 1, 0.5)})`} />
                <RangeSlider label="Lightness" motionValue={lightness} onCommit={() => {}} min={0} max={100} trackBackground={`linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 0.5)}, #fff)`} />
              </div>
            </motion.div>
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  );
};

export default ColorPicker;