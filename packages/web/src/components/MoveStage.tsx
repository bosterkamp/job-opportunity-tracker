import type { Opportunity } from '@jot/shared';
import { ApiError } from '../api/client';
import { CHANGED_ELSEWHERE_MESSAGE, useChangeStage } from '../api/hooks';
import { MoveStageMenu } from './MoveStageMenu';

// "Move to…" for one opportunity, saved through the API.
export function MoveStage({ opportunity, label }: { opportunity: Opportunity; label?: string }) {
  const changeStage = useChangeStage(opportunity.id);

  return (
    <MoveStageMenu
      currentStage={opportunity.stage}
      label={label}
      onMove={(move) =>
        changeStage
          .mutateAsync({ ...move, expectedChangeCount: opportunity.changeCount })
          // Failures here are always Errors: an ApiError from the server or a schema error.
          .catch((error: Error) => {
            throw new Error(
              error instanceof ApiError && error.status === 409
                ? CHANGED_ELSEWHERE_MESSAGE
                : error.message,
            );
          })
      }
    />
  );
}
