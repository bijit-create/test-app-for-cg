import React from 'react';

interface SlideLayoutProps {
  title: string;
  children: React.ReactNode;
}

export const SlideLayout: React.FC<SlideLayoutProps> = ({ title, children }) => {
  return (
    <div className="flex flex-col h-full w-full animate-fade-in">
      <h2 className="text-3xl font-display text-primary text-center mb-6">{title}</h2>
      <div className="flex-grow flex flex-col items-center justify-center w-full relative">
        {children}
      </div>
    </div>
  );
};
