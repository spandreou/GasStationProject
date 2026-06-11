import {
  fetchAttendanceHistoryByMonth,
  fetchLatestWeekSnapshotByWeekId,
  fetchWeekHistoryList,
  saveWeekHistorySnapshot,
} from '../../firebase/weekService';

export const firebaseWeekHistoryRepository = {
  listWeekHistory: fetchWeekHistoryList,
  getLatestWeekSnapshotByWeekId: fetchLatestWeekSnapshotByWeekId,
  saveWeekSnapshot: saveWeekHistorySnapshot,
  listAttendanceHistoryByMonth: fetchAttendanceHistoryByMonth,
};
