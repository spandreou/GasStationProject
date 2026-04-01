export const SHIFT_PRESETS = [
  { id: 'morning', label: 'Πρωινός', startTime: '06:00', endTime: '14:00', shiftType: 'morning' },
  { id: 'intermediate-0900', label: 'Ενδιάμεσος', startTime: '09:00', endTime: '17:00', shiftType: 'intermediate' },
  { id: 'intermediate-1000', label: 'Ενδιάμεσος', startTime: '10:00', endTime: '18:00', shiftType: 'intermediate' },
  { id: 'night', label: 'Βραδινός', startTime: '14:00', endTime: '22:00', shiftType: 'night' },
];

export const SHIFT_TYPE_OPTIONS = [
  { value: 'morning', label: 'Πρωινός' },
  { value: 'intermediate', label: 'Ενδιάμεσος' },
  { value: 'night', label: 'Βραδινός' },
  { value: 'custom', label: 'Προσαρμοσμένη' },
];

export const WEEKDAY_LABELS = [
  'Δευτέρα',
  'Τρίτη',
  'Τετάρτη',
  'Πέμπτη',
  'Παρασκευή',
  'Σάββατο',
  'Κυριακή',
];
