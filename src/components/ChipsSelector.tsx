'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChipsRequest,
  ChipsOption,
  ChipsGroup,
} from '@/features/screening-chat-v2/domain/types';
import Chip from '@/components/ui/Chip';

interface ChipsSelectorProps {
  request: ChipsRequest;
  /** Called whenever selection changes. */
  onSelectionChange: (selections: string[], isValid: boolean) => void;
  /** Called when a chip is toggled in edit mode — parent updates input text. */
  onChipToggleInEditMode?: (token: string, selected: boolean) => void;
  /** External override of selections (for text↔chip sync when editable). */
  externalSelections?: string[];
  disabled: boolean;
}

/**
 * ChipsSelector — tap-to-select UI for structured screening questions.
 *
 * Modes:
 * - Single-select (kontak): Ya/Tidak
 * - Multi-select (lokasi): multiple + "Lainnya" unlocks InputBar editing
 * - Grouped (asrama_tukar): 2 question groups, single-select per group
 *
 * When externalSelections is provided, chip active state is driven externally
 * (used when InputBar text editing syncs back to chip state).
 */
export default function ChipsSelector({
  request,
  onSelectionChange,
  onChipToggleInEditMode,
  externalSelections,
  disabled,
}: ChipsSelectorProps) {
  const [internalSelections, setInternalSelections] = useState<string[]>([]);

  // Use external selections if provided, otherwise internal
  const selections = externalSelections ?? internalSelections;
  const isEditMode = externalSelections !== undefined;

  // Sync internal selections when exiting edit mode (external → undefined)
  const prevExternalRef = useRef(externalSelections);
  useEffect(() => {
    if (prevExternalRef.current && !externalSelections) {
      // Was external, now internal — seed internal with last known external
      setInternalSelections(prevExternalRef.current.filter((s) => s !== 'Lainnya'));
    }
    prevExternalRef.current = externalSelections;
  }, [externalSelections]);

  const isGrouped = request.groups && request.groups.length > 0;

  const isValid = useMemo(() => {
    if (isGrouped && request.groups) {
      return request.groups.every((group) =>
        group.options.some((opt) => selections.includes(opt.token)),
      );
    }
    if (request.type === 'single') {
      return selections.length === 1;
    }
    return selections.length > 0;
  }, [selections, request, isGrouped]);

  // Notify parent whenever selection or validity changes
  useEffect(() => {
    onSelectionChange(selections, isValid);
  }, [selections, isValid, onSelectionChange]);

  const toggleChip = useCallback(
    (token: string, group?: string) => {
      if (disabled) return;

      // In edit mode, delegate to parent to update input text
      if (isEditMode && onChipToggleInEditMode) {
        const isSelected = selections.includes(token);
        onChipToggleInEditMode(token, !isSelected);
        return;
      }

      setInternalSelections((prev) => {
        if (isGrouped && group) {
          const groupOption = request.groups
            ?.find((g) => g.id === group)
            ?.options.map((o) => o.token);
          const withoutGroup = prev.filter((s) => !groupOption?.includes(s));
          if (prev.includes(token)) return withoutGroup;
          return [...withoutGroup, token];
        }

        if (request.type === 'single') {
          if (prev.includes(token)) return [];
          return [token];
        }

        // Multi-select: toggle
        if (prev.includes(token)) {
          return prev.filter((s) => s !== token);
        }
        return [...prev, token];
      });
    },
    [disabled, isGrouped, request, isEditMode, onChipToggleInEditMode, selections],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, token: string, group?: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleChip(token, group);
      }
    },
    [toggleChip],
  );

  // Grouped mode (asrama_tukar)
  if (isGrouped && request.groups) {
    return (
      <div className="flex flex-col gap-3" role="form" aria-label={request.question}>
        {request.groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            selections={selections}
            disabled={disabled}
            onToggle={toggleChip}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
    );
  }

  // Flat mode (single or multi)
  return (
    <div className="flex flex-col gap-3" role="form" aria-label={request.question}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={request.question}>
        {request.options.map((option) => (
          <ChipButton
            key={option.token}
            option={option}
            selected={selections.includes(option.token)}
            disabled={disabled}
            onToggle={toggleChip}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
    </div>
  );
}

// --- Sub-components ---

interface ChipButtonProps {
  option: ChipsOption;
  selected: boolean;
  disabled: boolean;
  onToggle: (token: string, group?: string) => void;
  onKeyDown: (e: React.KeyboardEvent, token: string, group?: string) => void;
}

function ChipButton({ option, selected, disabled, onToggle, onKeyDown }: ChipButtonProps) {
  return (
    <Chip
      active={selected}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={option.label}
      onClick={() => onToggle(option.token, option.group)}
      onKeyDown={(e) => onKeyDown(e, option.token, option.group)}
      tabIndex={0}
    >
      {option.label}
    </Chip>
  );
}

interface GroupSectionProps {
  group: ChipsGroup;
  selections: string[];
  disabled: boolean;
  onToggle: (token: string, group?: string) => void;
  onKeyDown: (e: React.KeyboardEvent, token: string, group?: string) => void;
}

function GroupSection({ group, selections, disabled, onToggle, onKeyDown }: GroupSectionProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-semibold text-text-strong">{group.question}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={group.question}>
        {group.options.map((option) => (
          <ChipButton
            key={option.token}
            option={{ ...option, group: group.id }}
            selected={selections.includes(option.token)}
            disabled={disabled}
            onToggle={onToggle}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
    </fieldset>
  );
}
