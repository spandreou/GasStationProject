import {
  cancelEmployeeAbsence,
  createEmployeeAbsence,
  removeEmployeeAbsence,
  subscribeEmployeeAbsences,
  subscribePublicEmployeeAbsences,
  updateEmployeeAbsence,
} from '../../firebase/absenceService';

export const firebaseAbsencesRepository = {
  subscribeAbsences: subscribeEmployeeAbsences,
  subscribePublicAbsences: subscribePublicEmployeeAbsences,
  createAbsence: createEmployeeAbsence,
  updateAbsence: updateEmployeeAbsence,
  cancelAbsence: cancelEmployeeAbsence,
  deleteAbsence: removeEmployeeAbsence,
};
