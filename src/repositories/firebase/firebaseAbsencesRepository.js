import {
  cancelEmployeeAbsence,
  createEmployeeAbsence,
  removeEmployeeAbsence,
  subscribeEmployeeAbsences,
  updateEmployeeAbsence,
} from '../../firebase/absenceService';

export const firebaseAbsencesRepository = {
  subscribeAbsences: subscribeEmployeeAbsences,
  createAbsence: createEmployeeAbsence,
  updateAbsence: updateEmployeeAbsence,
  cancelAbsence: cancelEmployeeAbsence,
  deleteAbsence: removeEmployeeAbsence,
};
