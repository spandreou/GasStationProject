import {
  createEmployee,
  removeEmployee,
  subscribeEmployees,
  updateEmployee,
} from '../../firebase/employeeService';

export const firebaseEmployeesRepository = {
  subscribeEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee: removeEmployee,
};
