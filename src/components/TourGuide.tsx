import React, { useState, useEffect, useLayoutEffect } from 'react';

export interface TourStep {
  selector: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void;
}

interface TourGuideProps {
  steps: TourStep[];
  tourKey: string;
  onComplete?: () => void;
}

export default function TourGuide({ steps, tourKey, onComplete }: TourGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetElement, setTargetElement] = useState<Element | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Check if tour has already been completed
  useEffect(() => {
    const isCompleted = localStorage.getItem(tourKey);
    if (isCompleted === 'true') {
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }
  }, [tourKey]);

  const currentStep = steps[currentStepIndex];

  // Action hook before showing step
  useEffect(() => {
    if (isVisible && currentStep?.action) {
      currentStep.action();
    }
  }, [currentStepIndex, isVisible]);

  // Find element coordinates on step change, window resize or scroll
  const updateCoordinates = () => {
    if (!isVisible || !currentStep) return;

    if (currentStep.selector === 'body' || currentStep.placement === 'center') {
      setTargetElement(null);
      setCoords(null);
      return;
    }

    const el = document.querySelector(currentStep.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      // Only set coordinates if element has size and is visible
      if (rect.width > 0 && rect.height > 0) {
        setTargetElement(el);
        setCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
        
        // Scroll element into view smoothly if it's offscreen
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    
    // Fallback to center if element not found or not rendered yet
    setTargetElement(null);
    setCoords(null);
  };

  useLayoutEffect(() => {
    updateCoordinates();
    
    // Add event listeners for resizing and scrolling to keep highlight positioned correctly
    window.addEventListener('resize', updateCoordinates);
    window.addEventListener('scroll', updateCoordinates);
    
    // Polling interval in case tab transitions take a moment to render the element
    const interval = setInterval(updateCoordinates, 500);

    return () => {
      window.removeEventListener('resize', updateCoordinates);
      window.removeEventListener('scroll', updateCoordinates);
      clearInterval(interval);
    };
  }, [currentStepIndex, isVisible, currentStep]);

  if (!isVisible || !currentStep) return null;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(tourKey, 'true');
    setIsVisible(false);
    if (onComplete) onComplete();
  };

  // Generate a clip-path style for the backdrop so the target element is unblurred and clear
  const getBackdropStyle = (): React.CSSProperties => {
    if (!coords || !targetElement) {
      return {};
    }
    const rect = targetElement.getBoundingClientRect();
    const padding = 8;
    const x1 = rect.left - padding;
    const y1 = rect.top - padding;
    const x2 = rect.left + rect.width + padding;
    const y2 = rect.top + rect.height + padding;

    return {
      clipPath: `polygon(
        0% 0%, 
        100% 0%, 
        100% 100%, 
        0% 100%, 
        0% ${y2}px, 
        ${x1}px ${y2}px, 
        ${x1}px ${y1}px, 
        ${x2}px ${y1}px, 
        ${x2}px ${y2}px, 
        0% ${y2}px
      )`
    };
  };

  // Determine tooltip card position style
  const getTooltipStyle = (): React.CSSProperties => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    if (isMobile) {
      return {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        width: 'calc(100vw - 32px)',
        maxWidth: '400px',
      };
    }

    if (!coords) {
      // Centered fallback style
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        width: 'min(90vw, 400px)',
      };
    }

    const { top, left, width, height } = coords;
    const padding = 12;
    const placement = currentStep.placement || 'bottom';

    // Tooltip position relative to highlight box
    switch (placement) {
      case 'top':
        return {
          position: 'absolute',
          top: `${top - padding}px`,
          left: `${left + width / 2}px`,
          transform: 'translate(-50%, -100%)',
          zIndex: 10000,
          width: 'min(90vw, 360px)',
        };
      case 'left':
        return {
          position: 'absolute',
          top: `${top + height / 2}px`,
          left: `${left - padding}px`,
          transform: 'translate(-100%, -50%)',
          zIndex: 10000,
          width: 'min(90vw, 320px)',
        };
      case 'right':
        return {
          position: 'absolute',
          top: `${top + height / 2}px`,
          left: `${left + width + padding}px`,
          transform: 'translate(0, -50%)',
          zIndex: 10000,
          width: 'min(90vw, 320px)',
        };
      case 'bottom':
      default:
        return {
          position: 'absolute',
          top: `${top + height + padding}px`,
          left: `${left + width / 2}px`,
          transform: 'translate(-50%, 0)',
          zIndex: 10000,
          width: 'min(90vw, 360px)',
        };
    }
  };

  return (
    <>
      {/* Dark Dimming Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[9998] transition-all duration-300"
        style={getBackdropStyle()}
        onClick={handleSkip} // Allow closing on backdrop click
      />

      {/* SVG Highlight Hole Mask for crisp overlays */}
      {coords && (
        <div 
          className="absolute pointer-events-none z-[9998] transition-all duration-300"
          style={{
            top: `${coords.top - 8}px`,
            left: `${coords.left - 8}px`,
            width: `${coords.width + 16}px`,
            height: `${coords.height + 16}px`,
            borderRadius: '12px',
          }}
        >
          <div className="absolute inset-0 rounded-xl border-2 border-indigo-400 animate-pulse opacity-80" />
        </div>
      )}

      {/* Floating Tooltip Card */}
      <div 
        style={getTooltipStyle()}
        className="bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(107,56,212,0.25)] border border-indigo-100 flex flex-col gap-4 animate-fade-in transition-all duration-300"
      >
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-widest text-[#00687a] font-black block mb-1">
              Step {currentStepIndex + 1} of {steps.length} &bull; Guided Tour
            </span>
            <h4 className="text-base font-display font-extrabold text-slate-900 leading-snug">
              {currentStep.title}
            </h4>
          </div>
          <button 
            onClick={handleSkip}
            className="text-slate-600 hover:text-slate-650 transition-colors p-1 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center"
            title="Skip Tour"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed font-sans">
          {currentStep.description}
        </p>

        <div className="flex justify-between items-center pt-2 mt-auto border-t border-slate-100">
          <button
            onClick={handleSkip}
            className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 font-sans font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            Skip
          </button>

          <button
            onClick={handleNext}
            className="px-4 py-2 bg-gradient-to-r from-[#6b38d4] to-indigo-700 hover:from-indigo-750 hover:to-indigo-800 text-white font-sans font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            {currentStepIndex === steps.length - 1 ? 'Get Started' : 'Next'}
            <span className="material-symbols-outlined text-[10px] font-bold">arrow_forward</span>
          </button>
        </div>
      </div>
    </>
  );
}

