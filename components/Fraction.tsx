import React from 'react';

interface FractionProps {
  n: React.ReactNode;
  d: React.ReactNode;
  scale?: number;
  className?: string;
  isInput?: boolean;
}

export const Fraction: React.FC<FractionProps> = ({ n, d, scale = 1, className = "", isInput = false }) => {
  const style = { transform: `scale(${scale})` };
  
  return (
    <div className={`fraction font-display text-primary ${className}`} style={style}>
      <span className={`numerator ${isInput ? 'border-b-4 border-gray-400' : ''}`}>{n}</span>
      <span className="denominator">{d}</span>
    </div>
  );
};
