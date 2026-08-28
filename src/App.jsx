import { Suspense, lazy, useEffect, useState } from 'react';
import CentralLandingPage from './components/auth/CentralLandingPage';
import AuthTicketCallback from './components/auth/AuthTicketCallback';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import LoginPage from './components/auth/LoginPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import RegisterPage from './components/auth/RegisterPage';
import RouteNoticePage from './components/auth/RouteNoticePage';
import SelectTenantPage from './components/auth/SelectTenantPage';
import TenantGate from './components/auth/TenantGate';
import MainDashboard from './components/scheduler/MainDashboard';
import { requestDynamicImportRecovery } from './utils/dynamicImportRecovery';
import { getCurrentTenantHostContext } from './utils/tenantHostContext';

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
  const [isInterfaceReady, setIsInterfaceReady] = useState(false);
  const [renderDynamicBackground, setRenderDynamicBackground] = useState(false);
  const [routePath, setRoutePath] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const tenantHostContext = getCurrentTenantHostContext();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    try {
      localStorage.removeItem('gas-station-theme');
    } catch {
      // Ignore storage access restrictions; the UI theme is presentation-only.
    }
  }, []);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setIsInterfaceReady(true);
    }, 1400);

    return () => window.clearTimeout(revealTimer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateBackgroundMode = () => {
      const reducedMotion = mediaQuery.matches;
      const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
      const saveData = Boolean(navigator.connection?.saveData);

      setRenderDynamicBackground(!(reducedMotion || lowMemory || saveData));
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleChunkError = (event) => {
      const error = event?.reason || event?.error || event;
      if (requestDynamicImportRecovery(error) && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleNavigation = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  let page = <MainDashboard />;
  if (routePath === '/' && tenantHostContext.mode === 'central') {
    page = <CentralLandingPage />;
  } else if (routePath === '/login') {
    page = <LoginPage />;
  } else if (routePath === '/register') {
    page = <RegisterPage />;
  } else if (routePath === '/forgot-password') {
    page = <ForgotPasswordPage />;
  } else if (routePath === '/reset-password') {
    page = <ResetPasswordPage />;
  } else if (routePath === '/select-tenant' || routePath === '/stores') {
    page = <SelectTenantPage />;
  } else if (routePath === '/request-token') {
    page = (
      <RouteNoticePage
        title="Αίτημα ενεργοποίησης"
        subtitle="Η ροή token/subscription θα ενεργοποιηθεί σε επόμενη φάση."
        message="Για ενεργοποίηση ή ανανέωση πρόσβασης, επικοινώνησε προσωρινά με τον διαχειριστή."
      />
    );
  } else if (routePath === '/admin-console') {
    page = (
      <RouteNoticePage
        title="Superadmin console"
        subtitle="Η κονσόλα superadmin δεν είναι ενεργή στο pilot deployment."
        message="Η πρόσβαση θα προστατευτεί με Firebase custom claim role=SUPERADMIN πριν εμφανιστούν δεδομένα."
      />
    );
  } else if (routePath === '/app') {
    page = <MainDashboard />;
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden" data-tenant-mode={tenantHostContext.mode}>
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        {renderDynamicBackground ? (
          <Suspense fallback={<StaticBackground />}>
            <div className="h-full w-full opacity-65">
              <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} />
            </div>
          </Suspense>
        ) : (
          <StaticBackground />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.58),rgba(2,6,23,0.72)_44%,rgba(2,6,23,0.86))]" />
      </div>
      <div className={`app-content-reveal relative z-10 ${isInterfaceReady ? 'app-content-reveal--ready' : ''}`}>
        <AuthTicketCallback />
        <TenantGate hostContext={tenantHostContext} routePath={routePath}>{page}</TenantGate>
      </div>
    </div>
  );
}

