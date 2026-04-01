import { Suspense, lazy, useEffect, useState } from 'react';
import MainDashboard from './components/scheduler/MainDashboard';

const Hyperspeed = lazy(() => import('./components/background/Hyperspeed'));

const HYPERSPEED_OPTIONS = {
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [12, 80],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x131338,
    brokenLines: 0x131338,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3,
  },
};

function StaticBackground() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(34,211,238,0.16),transparent_40%),radial-gradient(circle_at_70%_12%,rgba(236,72,153,0.14),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.48),rgba(2,6,23,0.76))]" />
  );
}

export default function App() {
  const [renderDynamicBackground, setRenderDynamicBackground] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateBackgroundMode = () => {
      const isMobileWidth = window.innerWidth < 1024;
      const reducedMotion = mediaQuery.matches;
      const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
      const saveData = Boolean(navigator.connection?.saveData);

      setRenderDynamicBackground(!(isMobileWidth || reducedMotion || lowMemory || saveData));
    };

    updateBackgroundMode();
    window.addEventListener('resize', updateBackgroundMode);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateBackgroundMode);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(updateBackgroundMode);
    }

    return () => {
      window.removeEventListener('resize', updateBackgroundMode);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateBackgroundMode);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(updateBackgroundMode);
      }
    };
  }, []);

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        {renderDynamicBackground ? (
          <Suspense fallback={<StaticBackground />}>
            <div className="h-full w-full opacity-75">
              <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} />
            </div>
          </Suspense>
        ) : (
          <StaticBackground />
        )}
      </div>
      <div className="relative z-10">
        <MainDashboard />
      </div>
    </div>
  );
}

