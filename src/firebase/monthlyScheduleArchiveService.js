import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './config';
import {
  ensureFirestoreReady,
  MONTHLY_SCHEDULE_EXPORTS_COLLECTION,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

function ensureStorageReady() {
  if (!storage) {
    throw new Error('Το Firebase Storage δεν είναι ρυθμισμένο. Έλεγξε τα env vars.');
  }
}

function toYearMonth(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 0 || numericMonth > 11) {
    throw new Error('Μη έγκυρος μήνας για αποθήκευση PDF.');
  }
  return `${String(numericYear).padStart(4, '0')}-${String(numericMonth + 1).padStart(2, '0')}`;
}

function monthBounds(year, month) {
  const yearMonth = toYearMonth(year, month);
  const lastDate = new Date(Date.UTC(Number(year), Number(month) + 1, 0)).getUTCDate();
  return {
    yearMonth,
    monthStart: `${yearMonth}-01`,
    monthEnd: `${yearMonth}-${String(lastDate).padStart(2, '0')}`,
  };
}

export async function saveMonthlyScheduleExport({
  year,
  month,
  pdfBlob,
  fileName,
  shiftCount = 0,
  createdBy = '',
}) {
  ensureFirestoreReady();
  ensureStorageReady();

  if (!(pdfBlob instanceof Blob)) {
    throw new Error('Δεν δημιουργήθηκε έγκυρο PDF για αποθήκευση.');
  }

  const { yearMonth, monthStart, monthEnd } = monthBounds(year, month);
  const safeFileName = fileName || `program_month_${yearMonth}.pdf`;
  const storagePath = `monthly_schedule_pdfs/${yearMonth}/${safeFileName}`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, pdfBlob, {
    contentType: 'application/pdf',
    customMetadata: {
      yearMonth,
      createdBy: createdBy || '',
    },
  });

  const payload = {
    yearMonth,
    monthStart,
    monthEnd,
    fileName: safeFileName,
    storagePath,
    contentType: 'application/pdf',
    size: pdfBlob.size,
    shiftCount: Number.isFinite(Number(shiftCount)) ? Number(shiftCount) : 0,
    createdBy: createdBy || '',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  await withFirestoreWrite(() =>
    setDoc(doc(db, MONTHLY_SCHEDULE_EXPORTS_COLLECTION, yearMonth), payload, { merge: true }),
  );

  return {
    ...payload,
    id: yearMonth,
  };
}

export async function fetchMonthlyScheduleExports(maxRows = 36) {
  ensureFirestoreReady();

  const safeLimit = Math.max(1, Math.min(120, Number(maxRows) || 36));
  const snapshot = await getDocs(
    query(collection(db, MONTHLY_SCHEDULE_EXPORTS_COLLECTION), orderBy('updatedAt', 'desc'), limit(safeLimit)),
  );

  return toDataWithId(snapshot);
}

export async function getMonthlyScheduleExportDownloadUrl(storagePath) {
  ensureStorageReady();
  if (!storagePath || typeof storagePath !== 'string') {
    throw new Error('Δεν βρέθηκε διαδρομή PDF για λήψη.');
  }
  return getDownloadURL(ref(storage, storagePath));
}
