import React from 'react';

export interface SlideData {
  id: number;
  title: string;
  script: string;
  component: React.FC<any>;
}

export interface Fraction {
  n: number | string; // Allow string for inputs
  d: number | string;
}