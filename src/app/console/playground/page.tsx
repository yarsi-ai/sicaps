'use client';

import { useCallback, useState } from 'react';
import { PlaygroundContextProvider, usePlaygroundContext } from './_components/PlaygroundContext';
import { ConfigPanel } from './_components/ConfigPanel';
import { PlaygroundTabs } from './_components/PlaygroundTabs';
import { PresetBar } from './_components/PresetBar';
import { ScoringToggle } from './_components/ScoringToggle';
import { ExportButton } from './_components/ExportButton';
import { SingleShotView } from './_components/SingleShotView';
import { MultiTurnView } from './_components/MultiTurnView';
import { CompareView } from './_components/CompareView';
import { ConsoleNav } from '../_components/ConsoleNav';
import { ResizeHandle } from '../testing/_components/ResizeHandle';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 260;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function PlaygroundPage() {
  return (
    <PlaygroundContextProvider>
      <PlaygroundLayout />
    </PlaygroundContextProvider>
  );
}

function PlaygroundActions() {
  return (
    <>
      <PresetBar />
      <div className="h-4 w-px bg-[#e2ddd0]" />
      <ScoringToggle />
      <div className="h-4 w-px bg-[#e2ddd0]" />
      <ExportButton />
    </>
  );
}

function PlaygroundLayout() {
  const { state, updateConfig } = usePlaygroundContext();
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, SIDEBAR_MAX));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ConsoleNav actions={<PlaygroundActions />} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Config sidebar — hidden in compare mode */}
        {state.mode !== 'compare' && (
          <>
            <aside
              style={{ width: sidebarWidth }}
              className="shrink-0 overflow-y-auto bg-[#fcfbf7]"
            >
              <ConfigPanel config={state.config} onUpdateConfig={updateConfig} />
            </aside>
            <ResizeHandle onResize={handleSidebarResize} />
          </>
        )}

        {/* Right content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-[#e2ddd0] bg-[#f7f4ee] px-4 py-2.5">
            <PlaygroundTabs />
          </div>

          {/* Active mode view */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <ActiveModeView mode={state.mode} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveModeView({ mode }: { mode: 'single-shot' | 'multi-turn' | 'compare' }) {
  switch (mode) {
    case 'single-shot':
      return <SingleShotView />;
    case 'multi-turn':
      return <MultiTurnView />;
    case 'compare':
      return <CompareView />;
  }
}
