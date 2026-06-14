import {
  deletePublishedSchedulesByWeekStarts,
  publishWeekSchedule,
  subscribePublishedSchedule,
} from '../../firebase/publishedScheduleService';

export const firebasePublishedSchedulesRepository = {
  deleteByWeekStarts: deletePublishedSchedulesByWeekStarts,
  publishWeekSchedule,
  subscribePublishedSchedule,
};
