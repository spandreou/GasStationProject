import {
  subscribeSchedulerSettings,
  upsertSchedulerSettings,
} from '../../firebase/settingsService';

export const firebaseSchedulerSettingsRepository = {
  subscribeSettings: subscribeSchedulerSettings,
  upsertSettings: upsertSchedulerSettings,
};
