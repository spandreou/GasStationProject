import { timeToMinutes } from './time';

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function findOverlapConflicts(shifts, candidate) {
  // Ελέγχουμε μόνο βάρδιες του ίδιου υπαλλήλου και της ίδιας ημέρας.
  if (!candidate?.employeeId || !candidate?.date) {
    return [];
  }

  const candidateStart = timeToMinutes(candidate.startTime);
  const candidateEnd = timeToMinutes(candidate.endTime);

  return shifts.filter((shift) => {
    if (shift.id === candidate.id) return false;
    if (shift.employeeId !== candidate.employeeId) return false;
    if (shift.date !== candidate.date) return false;

    const shiftStart = timeToMinutes(shift.startTime);
    const shiftEnd = timeToMinutes(shift.endTime);
    return rangesOverlap(candidateStart, candidateEnd, shiftStart, shiftEnd);
  });
}

export function hasTimeOverlap(shifts, candidate) {
  return findOverlapConflicts(shifts, candidate).length > 0;
}
