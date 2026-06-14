import {
  fetchMonthlyScheduleArchiveBlob,
  listMonthlyScheduleArchives,
  saveMonthlyScheduleArchive,
} from '../../firebase/monthlyScheduleArchiveService';

export const firebaseMonthlyScheduleArchiveRepository = {
  fetchBlob: fetchMonthlyScheduleArchiveBlob,
  list: listMonthlyScheduleArchives,
  save: saveMonthlyScheduleArchive,
};
