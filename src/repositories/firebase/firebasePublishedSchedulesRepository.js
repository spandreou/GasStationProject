import {
  deletePublishedMonth,
  deletePublishedSchedulesByWeekStarts,
  deletePublicAnnouncement,
  publishMonthSchedule,
  publishPublicAnnouncement,
  publishPublicEmployees,
  publishWeekSchedule,
  subscribePublishedMonth,
  subscribePublishedSchedule,
  subscribePublicAnnouncements,
  subscribePublicEmployees,
} from '../../firebase/publishedScheduleService';

export const firebasePublishedSchedulesRepository = {
  deleteByWeekStarts: deletePublishedSchedulesByWeekStarts,
  deleteMonth: deletePublishedMonth,
  deletePublicAnnouncement,
  publishMonthSchedule,
  publishPublicAnnouncement,
  publishPublicEmployees,
  publishWeekSchedule,
  subscribePublishedMonth,
  subscribePublishedSchedule,
  subscribePublicAnnouncements,
  subscribePublicEmployees,
};
