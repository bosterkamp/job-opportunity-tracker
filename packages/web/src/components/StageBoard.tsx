import type { Opportunity } from '@jot/shared';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { BoardGroup, BoardKey } from '../features/overview/overviewModel';
import { WIDE_QUERY, useMediaQuery } from '../useMediaQuery';
import styles from './StageBoard.module.css';

interface StageBoardProps {
  groups: BoardGroup[];
  renderCard: (opportunity: Opportunity) => ReactNode;
}

// The overview's layout (spec US3): at 1280 px and wider, one column per stage and a last one
// for closed opportunities; narrower, a tab for each with its cards below. Each shows how many
// it holds.
export function StageBoard({ groups, renderCard }: StageBoardProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  return wide ? (
    <Columns groups={groups} renderCard={renderCard} />
  ) : (
    <Tabs groups={groups} renderCard={renderCard} />
  );
}

function CardList({
  group,
  renderCard,
}: {
  group: BoardGroup;
  renderCard: StageBoardProps['renderCard'];
}) {
  if (group.items.length === 0) {
    return (
      <p className={styles.empty}>
        {group.key === 'CLOSED' ? 'Nothing closed yet' : `Nothing in ${group.label}`}
      </p>
    );
  }
  return (
    <ul className={styles.cards} aria-label={group.label}>
      {group.items.map((o) => (
        <li key={o.id}>{renderCard(o)}</li>
      ))}
    </ul>
  );
}

function Columns({ groups, renderCard }: StageBoardProps) {
  const id = useId();
  return (
    <div
      className={styles.board}
      data-board
      style={{ '--columns': groups.length } as CSSProperties}
    >
      {groups.map((group) => (
        <section key={group.key} className={styles.column} aria-labelledby={`${id}-${group.key}`}>
          <h3 id={`${id}-${group.key}`} className={styles.columnTitle}>
            {group.label}
            <span className={styles.count}>{group.items.length}</span>
          </h3>
          <CardList group={group} renderCard={renderCard} />
        </section>
      ))}
    </div>
  );
}

function Tabs({ groups, renderCard }: StageBoardProps) {
  const id = useId();
  const [chosen, setChosen] = useState<BoardKey | null>(null);
  const tabRefs = useRef(new Map<BoardKey, HTMLButtonElement>());
  // Fall back to the first stage when nothing is chosen yet, or the chosen one is filtered out.
  // There is always at least one group: the overview passes every group, or the one filtered.
  const firstGroup = groups[0] as BoardGroup;
  const selected = groups.find((g) => g.key === chosen) ?? firstGroup;

  // Arrow keys move between tabs (the WAI-ARIA tabs pattern), wrapping at the ends.
  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) {
      return;
    }
    const next = groups[(index + step + groups.length) % groups.length] as BoardGroup;
    setChosen(next.key);
    tabRefs.current.get(next.key)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Stages" className={styles.tabs}>
        {groups.map((group, index) => {
          const isSelected = group === selected;
          return (
            <button
              key={group.key}
              ref={(el) => {
                if (el) tabRefs.current.set(group.key, el);
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${group.key}`}
              aria-selected={isSelected}
              aria-controls={`${id}-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => setChosen(group.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {group.label} ({group.items.length})
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected.key}`}>
        <CardList group={selected} renderCard={renderCard} />
      </div>
    </>
  );
}
