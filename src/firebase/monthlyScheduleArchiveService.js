import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  where,
  query,
} from 'firebase/firestore';
import { getBlob, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './config';
import {
  MONTHLY_SCHEDULE_EXPORTS_COLLECTION,
  ensureFirestoreReady,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

const DEFAULT_TENANT_ID = 'bp-kallis';
const TENANT_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function safeTenantId(value) {
  const tenantId = String(value || DEFAULT_TENANT_ID).trim().toLowerCase();
  return TENANT_ID_PATTERN.test(tenantId) ? tenantId : DEFAULT_TENANT_ID;
}

function assertYearMonth(yearMonth) {
  const safeYearMonth = String(yearMonth || '').trim();
  if (!YEAR_MONTH_PATTERN.test(safeYearMonth)) {
    throw new Error('Μη έγκυρος μήνας για αρχείο προγράμματος.');
  }
  return safeYearMonth;
}

function assertStorageReady() {
  if (!storage) {
    throw new Error('Το Firebase Storage δεν είναι ρυθμισμένο.');
  }
}

export function buildMonthlyScheduleArchivePath({ tenantId = DEFAULT_TENANT_ID, yearMonth }) {
  const safeTenant = safeTenantId(tenantId);
  const safeYearMonth = assertYearMonth(yearMonth);
  return {
    tenantId: safeTenant,
    yearMonth: safeYearMonth,
    docId: `${safeTenant}_${safeYearMonth}`,
    fileName: `program_month_${safeYearMonth}.pdf`,
    storagePath: `tenants/${safeTenant}/monthly_schedule_pdfs/${safeYearMonth}/program_month_${safeYearMonth}.pdf`,
  };
}

export async function saveMonthlyScheduleArchive({
  tenantId = DEFAULT_TENANT_ID,
  yearMonth,
  pdfBlob,
  createdBy = '',
  shiftCount = 0,
}) {
  ensureFirestoreReady();
  assertStorageReady();

  if (!(pdfBlob instanceof Blob)) {
    throw new Error('Δεν δημιουργήθηκε έγκυρο PDF αρχείο.');
  }

  const archivePath = buildMonthlyScheduleArchivePath({ tenantId, yearMonth });
  const storageRef = ref(storage, archivePath.storagePath);

  await uploadBytes(storageRef, pdfBlob, {
    contentType: 'application/pdf',
    customMetadata: {
      tenantId: archivePath.tenantId,
      yearMonth: archivePath.yearMonth,
    },
  });

  const payload = {
    tenantId: archivePath.tenantId,
    yearMonth: archivePath.yearMonth,
    fileName: archivePath.fileName,
    storagePath: archivePath.storagePath,
    createdBy: String(createdBy || '').slice(0, 160),
    shiftCount: Number.isFinite(Number(shiftCount)) ? Math.max(0, Math.floor(Number(shiftCount))) : 0,
    status: 'READY',
    updatedAt: serverTimestamp(),
  };

  await withFirestoreWrite(() =>
    setDoc(
      doc(db, MONTHLY_SCHEDULE_EXPORTS_COLLECTION, archivePath.docId),
      {
        ...payload,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    ),
  );

  return {
    id: archivePath.docId,
    ...payload,
  };
}

export async function listMonthlyScheduleArchives({ tenantId = DEFAULT_TENANT_ID } = {}) {
  ensureFirestoreReady();
  const safeTenant = safeTenantId(tenantId);
  const snapshot = await getDocs(
    query(collection(db, MONTHLY_SCHEDULE_EXPORTS_COLLECTION), where('tenantId', '==', safeTenant)),
  );

  return toDataWithId(snapshot).sort((a, b) => String(b.yearMonth || '').localeCompare(String(a.yearMonth || '')));
}

export async function fetchMonthlyScheduleArchiveBlob({ storagePath }) {
  assertStorageReady();
  const safePath = String(storagePath || '').trim();
  if (!safePath.startsWith('tenants/') || !safePath.includes('/monthly_schedule_pdfs/')) {
    throw new Error('Μη έγκυρη διαδρομή αρχείου.');
  }

  return getBlob(ref(storage, safePath));
}
