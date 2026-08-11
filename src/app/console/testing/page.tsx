'use client';

import { useCallback, useRef, useState } from 'react';
import { TestingProvider, useTestingContext } from './_components/TestingContext';
import { TestingActions } from './_components/TestingActions';
import { ConsoleNav } from '../_components/ConsoleNav';
import { SessionsSidebar } from './_components/SessionsSidebar';
import { ChatArea } from './_components/ChatArea';
import { ScoringPane } from './_components/ScoringPane';
import { InspectorPanel } from './_components/InspectorPanel';
import { ScoringSummaryBar } from './_components/ScoringSummaryBar';
import { ResizeHandle } from './_components/ResizeHandle';

/** Panel width constraints (px) */
const LIMITS = {
  sidebar: { min: 250, max: 320 },
  chat: { min: 460 },
  scoring: { min: 250, max: 400 },
  inspector: { min: 240 },
} as const;

const DEFAULTS = { sidebar: 220, scoring: 260, inspector: 320 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function TestingPage() {
  return (
    <TestingProvider>
      <ResizableLayout />
    </TestingProvider>
  );
}

function ResizableLayout() {
  const { state } = useTestingContext();
  const containerRef = useRef<HTMLDivElement>(null);

  const [sidebar, setSidebar] = useState(DEFAULTS.sidebar);
  const [scoring, setScoring] = useState(DEFAULTS.scoring);
  const [inspector, setInspector] = useState(DEFAULTS.inspector);

  const inspectorVisible = state.inspectorOpen;

  /**
   * Handle 1: between sidebar and chat
   * Drag RIGHT → sidebar grows, chat shrinks → cascade: scoring shrinks → inspector shrinks
   * Drag LEFT  → sidebar shrinks (at min → stops)
   */
  const handleSidebarResize = useCallback(
    (delta: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 1200;
      const handles = inspectorVisible ? 12 : 8;
      const rightPanels = scoring + (inspectorVisible ? inspector : 0);

      if (delta > 0) {
        // Dragging RIGHT: sidebar grows → need space from right side
        const needed = delta;
        let newSidebar = sidebar;
        let newScoring = scoring;
        let newInspector = inspector;

        // First: take from chat (flex absorbs)
        const chatAfter = containerWidth - (sidebar + needed) - rightPanels - handles;
        if (chatAfter >= LIMITS.chat.min) {
          newSidebar = Math.min(sidebar + needed, LIMITS.sidebar.max);
        } else {
          // Chat at min — cascade to scoring
          const chatDeficit = LIMITS.chat.min - chatAfter;
          const scoringGive = Math.min(chatDeficit, scoring - LIMITS.scoring.min);
          newScoring = scoring - scoringGive;

          // Still need more? Cascade to inspector
          const remaining = chatDeficit - scoringGive;
          if (remaining > 0 && inspectorVisible) {
            const inspGive = Math.min(remaining, inspector - LIMITS.inspector.min);
            newInspector = inspector - inspGive;
          }

          // Recalculate max sidebar after cascading
          const totalRightAfter = newScoring + (inspectorVisible ? newInspector : 0);
          const maxSidebar = containerWidth - LIMITS.chat.min - totalRightAfter - handles;
          newSidebar = clamp(
            sidebar + needed,
            LIMITS.sidebar.min,
            Math.min(LIMITS.sidebar.max, maxSidebar),
          );
        }

        setSidebar(newSidebar);
        setScoring(newScoring);
        if (inspectorVisible) setInspector(newInspector);
      } else {
        // Dragging LEFT: sidebar shrinks → chat grows (no cascade needed)
        setSidebar(clamp(sidebar + delta, LIMITS.sidebar.min, LIMITS.sidebar.max));
      }
    },
    [sidebar, scoring, inspector, inspectorVisible],
  );

  /**
   * Handle 2: between chat and scoring
   * Drag RIGHT → scoring shrinks → cascade: inspector shrinks
   * Drag LEFT  → scoring grows, chat shrinks → cascade: sidebar shrinks
   */
  const handleScoringResize = useCallback(
    (delta: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 1200;
      const handles = inspectorVisible ? 12 : 8;

      if (delta > 0) {
        // Dragging RIGHT: scoring shrinks, chat grows → cascade to inspector
        let newScoring = scoring;
        let newInspector = inspector;

        const scoringGive = Math.min(delta, scoring - LIMITS.scoring.min);
        newScoring = scoring - scoringGive;

        // If scoring is at min and still dragging → cascade to inspector
        const remaining = delta - scoringGive;
        if (remaining > 0 && inspectorVisible) {
          const inspGive = Math.min(remaining, inspector - LIMITS.inspector.min);
          newInspector = inspector - inspGive;
        }

        setScoring(newScoring);
        if (inspectorVisible) setInspector(newInspector);
      } else {
        // Dragging LEFT: scoring grows, chat shrinks → cascade to sidebar
        const grow = -delta;
        let newScoring = scoring;
        let newSidebar = sidebar;

        const chatNow =
          containerWidth - sidebar - scoring - (inspectorVisible ? inspector : 0) - handles;
        const chatAfter = chatNow - grow;

        if (chatAfter >= LIMITS.chat.min) {
          newScoring = clamp(scoring + grow, LIMITS.scoring.min, LIMITS.scoring.max);
        } else {
          // Chat would go below min → cascade: shrink sidebar
          const chatDeficit = LIMITS.chat.min - chatAfter;
          const sidebarGive = Math.min(chatDeficit, sidebar - LIMITS.sidebar.min);
          newSidebar = sidebar - sidebarGive;

          // Recalculate max scoring growth
          const totalSpace =
            containerWidth -
            newSidebar -
            (inspectorVisible ? inspector : 0) -
            handles -
            LIMITS.chat.min;
          newScoring = clamp(
            scoring + grow,
            LIMITS.scoring.min,
            Math.min(LIMITS.scoring.max, totalSpace),
          );
        }

        setSidebar(newSidebar);
        setScoring(newScoring);
      }
    },
    [sidebar, scoring, inspector, inspectorVisible],
  );

  /**
   * Handle 3: between scoring and inspector
   * Drag RIGHT → inspector shrinks (at min → stops)
   * Drag LEFT  → inspector grows, chat shrinks → cascade: scoring shrinks → sidebar shrinks
   */
  const handleInspectorResize = useCallback(
    (delta: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 1200;
      const handles = 12;

      if (delta > 0) {
        // Dragging RIGHT: inspector shrinks → chat grows (no cascade needed)
        setInspector(Math.max(LIMITS.inspector.min, inspector - delta));
      } else {
        // Dragging LEFT: inspector grows → cascade leftward
        const grow = -delta;
        let newInspector = inspector + grow;
        let newScoring = scoring;
        let newSidebar = sidebar;

        const chatNow = containerWidth - sidebar - scoring - inspector - handles;
        const chatAfter = chatNow - grow;

        if (chatAfter >= LIMITS.chat.min) {
          // Chat absorbs the squeeze
          newInspector = inspector + grow;
        } else {
          // Chat at min → cascade: shrink scoring
          const chatDeficit = LIMITS.chat.min - chatAfter;
          const scoringGive = Math.min(chatDeficit, scoring - LIMITS.scoring.min);
          newScoring = scoring - scoringGive;

          // Still need more? Shrink sidebar
          const remaining = chatDeficit - scoringGive;
          if (remaining > 0) {
            const sidebarGive = Math.min(remaining, sidebar - LIMITS.sidebar.min);
            newSidebar = sidebar - sidebarGive;
            const totalGiven = scoringGive + sidebarGive;
            // Cap inspector growth to what was actually freed
            newInspector = inspector + Math.min(grow, chatNow - LIMITS.chat.min + totalGiven);
          } else {
            newInspector = inspector + grow;
          }
        }

        setSidebar(newSidebar);
        setScoring(newScoring);
        setInspector(Math.max(LIMITS.inspector.min, newInspector));
      }
    },
    [sidebar, scoring, inspector],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ConsoleNav actions={<TestingActions />} />

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div style={{ width: sidebar }} className="shrink-0 overflow-hidden">
          <SessionsSidebar />
        </div>

        <ResizeHandle onResize={handleSidebarResize} direction="right" />

        {/* Chat (flex) */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: LIMITS.chat.min }}>
          <ScoringSummaryBar />
          <ChatArea />
        </div>

        <ResizeHandle onResize={handleScoringResize} direction="right" />

        {/* Scoring */}
        <div style={{ width: scoring }} className="hidden shrink-0 overflow-hidden lg:block">
          <ScoringPane />
        </div>

        {/* Inspector (conditional) */}
        {inspectorVisible && (
          <>
            <ResizeHandle onResize={handleInspectorResize} direction="right" />
            <div style={{ width: inspector }} className="shrink-0 overflow-hidden">
              <InspectorPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
