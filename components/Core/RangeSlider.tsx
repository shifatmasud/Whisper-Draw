/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useState } from 'react';
import { type MotionValue, motion, useTransform, useMotionValueEvent } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';

// A sub-component that only re-renders when the motion value changes.
const MotionValueInput: React.FC<{
  motionValue: MotionValue<number>;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  style: React.CSSProperties;
}> = ({ motionValue, min, max, step, onCommit, style }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(motionValue.get().toString());
  const precision = step.toString().split('.')[1]?.length || 0;

  useMotionValueEvent(motionValue, "change", (latest) => {
    // Only update from motion value if the input is not focused, to prevent cursor jumping
    if (document.activeElement !== inputRef.current) {
      setInputValue(latest.toFixed(precision));
    }
  });

  const handleCommit = (valueStr: string) => {
    const value = parseFloat(valueStr);
    const clamped = Math.min(Math.max(isNaN(value) ? motionValue.get() : value, min), max);
    setInputValue(clamped.toFixed(precision));
    motionValue.set(clamped);
    onCommit(clamped);
  };

  return (
    <input
      ref={inputRef}
      type="text" // Use text to allow intermediate states like "1."
      inputMode="decimal"
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        const num = parseFloat(e.target.value);
        if (!isNaN(num)) {
          motionValue.set(num); // Update motion value in real-time
        }
      }}
      onBlur={(e) => handleCommit(e.target.value)}
      onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleCommit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
      }}
      style={style}
    />
  );
};

interface RangeSliderProps {
  label: string;
  motionValue: MotionValue<number>;
  onCommit: (value: number) => void;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  trackBackground?: string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ label, motionValue, onCommit, onChange, min = 0, max = 100, step = 0.1, trackBackground }) => {
  const { theme } = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const rawValue = min + percent * (max - min);
    
    // Improved snapping logic for floats
    const numSteps = (rawValue - min) / step;
    const snappedValue = min + Math.round(numSteps) * step;

    const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
    const finalValue = parseFloat(snappedValue.toFixed(precision));

    motionValue.set(finalValue);
    if (onChange) {
      onChange(finalValue);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    trackRef.current?.setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      updateValueFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      trackRef.current?.releasePointerCapture(e.pointerId);
      onCommit(motionValue.get());
    }
  };

  const percentageString = useTransform(motionValue, (v) => {
    const clampedV = Math.max(min, Math.min(max, v));
    return `${((clampedV - min) / (max - min)) * 100}%`;
  });

  const numberInputStyle: React.CSSProperties = {
    width: '60px',
    padding: theme.spacing['Space.XS'],
    borderRadius: theme.radius['Radius.S'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    backgroundColor: theme.Color.Base.Surface[2],
    color: theme.Color.Base.Content[1],
    fontFamily: theme.Type.Readable.Body.M.fontFamily,
    fontSize: '14px',
    textAlign: 'center',
    outline: 'none',
  };
  
  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    width: '18px',
    height: '18px',
    backgroundColor: theme.Color.Base.Surface[1],
    border: `2px solid ${theme.Color.Accent.Surface[1]}`,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    boxShadow: theme.effects['Effect.Shadow.Drop.1'],
    transformOrigin: 'center'
  };

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <label style={{ ...theme.Type.Readable.Label.S, display: 'block', marginBottom: theme.spacing['Space.S'], color: theme.Color.Base.Content[2] }}>
        {label}
      </label>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing['Space.S'] }}>
        <div 
            ref={trackRef}
            style={{ 
                flex: 1, 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                touchAction: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div style={{ 
                position: 'relative', 
                width: '100%', 
                height: '6px', 
                backgroundColor: theme.Color.Base.Surface[3], 
                borderRadius: '3px',
                overflow: 'visible',
                background: trackBackground
            }}>
                {!trackBackground && <motion.div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    height: '100%', 
                    width: percentageString, 
                    backgroundColor: theme.Color.Accent.Surface[1], 
                    borderRadius: '3px' 
                }} />}
                
                <motion.div style={{
                    ...thumbStyle,
                    left: percentageString,
                }} />
            </div>
        </div>

        <MotionValueInput
          motionValue={motionValue}
          min={min}
          max={max}
          step={step}
          onCommit={onCommit}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
};

export default RangeSlider;