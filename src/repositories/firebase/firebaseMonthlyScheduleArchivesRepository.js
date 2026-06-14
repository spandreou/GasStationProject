import {
  fetchMonthlyScheduleExports,
  getMonthlyScheduleExportDownloadUrl,
  saveMonthlyScheduleExport,
} from '../../firebase/monthlyScheduleArchiveService';

export const firebaseMonthlyScheduleArchivesRepository = {
  getDownloadUrl: getMonthlyScheduleExportDownloadUrl,
  list: fetchMonthlyScheduleExports,
  save: saveMonthlyScheduleExport,
};
