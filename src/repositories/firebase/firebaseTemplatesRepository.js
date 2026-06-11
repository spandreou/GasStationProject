import {
  fetchWeekTemplates,
  saveWeekTemplate,
} from '../../firebase/weekService';

export const firebaseTemplatesRepository = {
  listWeekTemplates: fetchWeekTemplates,
  createWeekTemplate: saveWeekTemplate,
};
