import {
  createAnnouncement,
  removeAnnouncement,
  subscribeAnnouncements,
} from '../../firebase/announcementService';

export const firebaseAnnouncementsRepository = {
  subscribeAnnouncements,
  createAnnouncement,
  deleteAnnouncement: removeAnnouncement,
};
