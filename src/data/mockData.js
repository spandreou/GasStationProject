import { getIsoDate, getMonday } from '../utils/time';

export const sampleEmployees = [
  {
    id: 'emp-1',
    fullName: 'Γιάννης Παπαδόπουλος',
    role: 'Υπεύθυνος',
    color: '#F97316',
    afm: '123456789',
    phone: '6900000001',
    email: 'giannis@example.com',
    hireDate: '2024-01-15',
    isActive: true,
  },
  {
    id: 'emp-2',
    fullName: 'Μαρία Κωνσταντίνου',
    role: 'Ταμείο',
    color: '#0284C7',
    afm: '987654321',
    phone: '6900000002',
    email: 'maria@example.com',
    hireDate: '2023-09-10',
    isActive: true,
  },
  {
    id: 'emp-3',
    fullName: 'Νίκος Αντωνίου',
    role: 'Ανεφοδιασμός',
    color: '#16A34A',
    afm: '111222333',
    phone: '6900000003',
    email: 'nikos@example.com',
    hireDate: '2024-05-05',
    isActive: true,
  },
  {
    id: 'emp-4',
    fullName: 'Ελένη Δημητρίου',
    role: 'Ταμείο',
    color: '#A855F7',
    afm: '444555666',
    phone: '6900000004',
    email: 'eleni@example.com',
    hireDate: '2022-11-01',
    isActive: true,
  },
];

export function buildSampleShifts() {
  const monday = getMonday();
  const mondayIso = getIsoDate(monday);
  const tuesday = new Date(monday);
  tuesday.setDate(tuesday.getDate() + 1);
  const tuesdayIso = getIsoDate(tuesday);

  return [
    {
      id: 'shift-1',
      employeeId: 'emp-1',
      date: mondayIso,
      startTime: '06:00',
      endTime: '14:00',
      label: 'Πρωινή',
      notes: '',
    },
    {
      id: 'shift-2',
      employeeId: 'emp-2',
      date: mondayIso,
      startTime: '14:00',
      endTime: '22:00',
      label: 'Απογευματινή',
      notes: '',
    },
    {
      id: 'shift-3',
      employeeId: 'emp-3',
      date: tuesdayIso,
      startTime: '06:00',
      endTime: '14:00',
      label: 'Πρωινή',
      notes: '',
    },
  ];
}
