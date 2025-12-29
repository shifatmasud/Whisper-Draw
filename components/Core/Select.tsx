/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';

interface SelectProps {
  label: string;
  value: string;
  onChange: (e: any) => void;
  options: { value: string; label: string }[];
  style?: React.CSSProperties;
}

const Select: React.FC<SelectProps> = ({ label, value, onChange, options, style }) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  // Find label for current value
  const currentLabel = options.find(opt => opt.value === value)?.label || value;

  const handleSelect = (newValue: string) => {
    onChange({ target: { value: newValue } });
    setIsOpen(false);
  };

  // Calculate position on open
  useEffect(() => {
    if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuPosition({
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        });
    }
  }, [isOpen]);

  // Handle click outside and scroll
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (triggerRef.current && triggerRef.current.contains(event.target as Node)) {
            return;
        }
        setIsOpen(false);
    };

    const handleScroll = () => {
        if(isOpen) setIsOpen(false);
    };

    if (isOpen) {
        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
    }
    return () => {
        window.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const triggerStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing['Space.S'],
    borderRadius: theme.radius['Radius.S'],
    border: `1px solid ${isOpen ? theme.Color.Focus.Content[1] : theme.Color.Base.Surface[3]}`,
    backgroundColor: theme.Color.Base.Surface[2],
    color: theme.Color.Base.Content[1],
    fontFamily: theme.Type.Readable.Body.M.fontFamily,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    outline: 'none',
    transition: `border-color ${theme.time['Time.2x']} ease`,
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    top: menuPosition.top,
    left: menuPosition.left,
    width: menuPosition.width,
    backgroundColor: theme.Color.Base.Surface[2],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    borderRadius: theme.radius['Radius.S'],
    boxShadow: theme.effects['Effect.Shadow.Drop.3'], // Increased elevation
    zIndex: 9999, // Ensure it's on top of everything
    overflow: 'hidden',
    padding: theme.spacing['Space.XS'],
  };

  return (
    <div style={{ position: 'relative', ...style }} onPointerDown={(e) => e.stopPropagation()}>
      <label style={{ ...theme.Type.Readable.Label.S, display: 'block', marginBottom: theme.spacing['Space.S'], color: theme.Color.Base.Content[2] }}>
        {label}
      </label>
      
      {/* Trigger Button */}
      <motion.button
        ref={triggerRef}
        style={triggerStyle}
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.98 }}
        type="button"
      >
        <span>{currentLabel}</span>
        <motion.i 
            className="ph-bold ph-caret-down" 
            animate={{ rotate: isOpen ? 180 : 0 }}
        />
      </motion.button>

      {/* Portal Dropdown */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              style={dropdownStyle}
              initial={{ opacity: 0, y: -10, scaleY: 0.9 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -10, scaleY: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              {options.map((option) => (
                <motion.div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  style={{
                    padding: `${theme.spacing['Space.S']} ${theme.spacing['Space.M']}`,
                    cursor: 'pointer',
                    borderRadius: theme.radius['Radius.S'],
                    color: option.value === value ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[1],
                    backgroundColor: option.value === value ? theme.Color.Accent.Surface[1] : 'transparent',
                    fontFamily: theme.Type.Readable.Body.M.fontFamily,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '2px'
                  }}
                  whileHover={{ 
                      backgroundColor: option.value === value ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[3] 
                  }}
                >
                  {option.label}
                  {option.value === value && <i className="ph-bold ph-check" />}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default Select;