import {
  finalizeWeekAttendance,
  isWeekFinalized,
} from '../../firebase/weekService';

export const firebaseWeekLocksRepository = {
  isWeekFinalized,
  finalizeWeek: finalizeWeekAttendance,
};
