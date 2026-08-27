import assert from 'node:assert/strict';
import {
  OwnerIdentityValidationError,
  validateOwnerConfirmationInput,
} from './lib/owner-identity-validator.mjs';

function runTests() {
  console.log('Running Owner Identity Validator Tests...');

  // 1. Valid inputs
  const valid = validateOwnerConfirmationInput({
    ownerUid: 'BP_Kallis_Owner_123-abc',
    tenantId: 'bp-kallis',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.ownerUid, 'BP_Kallis_Owner_123-abc');
  assert.equal(valid.tenantId, 'bp-kallis');
  assert.equal(valid.membershipId, 'BP_Kallis_Owner_123-abc_bp-kallis');

  // 2. Reject empty or invalid input objects
  assert.throws(() => validateOwnerConfirmationInput(null), /INVALID_INPUT_OBJECT/);
  assert.throws(() => validateOwnerConfirmationInput(undefined), /INVALID_INPUT_OBJECT/);
  assert.throws(() => validateOwnerConfirmationInput([]), /INVALID_INPUT_OBJECT/);
  assert.throws(() => validateOwnerConfirmationInput('string'), /INVALID_INPUT_OBJECT/);

  // 3. Reject empty UID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: '', tenantId: 'bp-kallis' }),
    /EMPTY_OWNER_UID/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: '   ', tenantId: 'bp-kallis' }),
    /EMPTY_OWNER_UID/
  );

  // 4. Reject path traversal or slashes in UID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: '../admin', tenantId: 'bp-kallis' }),
    /PATH_TRAVERSAL_IN_UID/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'admin/hacker', tenantId: 'bp-kallis' }),
    /PATH_TRAVERSAL_IN_UID/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'admin\\hacker', tenantId: 'bp-kallis' }),
    /PATH_TRAVERSAL_IN_UID/
  );

  // 5. Reject special chars or spaces in UID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner with spaces', tenantId: 'bp-kallis' }),
    /INVALID_UID_FORMAT/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner@email.com', tenantId: 'bp-kallis' }),
    /INVALID_UID_FORMAT/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner$key', tenantId: 'bp-kallis' }),
    /INVALID_UID_FORMAT/
  );

  // 6. Reject forbidden prototype property names
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: '__proto__', tenantId: 'bp-kallis' }),
    /FORBIDDEN_UID_VALUE/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: '__proto__' }),
    /FORBIDDEN_TENANT_VALUE/
  );

  // 7. Reject empty tenant ID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: '' }),
    /EMPTY_TENANT_ID/
  );

  // 8. Reject path traversal in tenant ID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: '../tenant' }),
    /PATH_TRAVERSAL_IN_TENANT/
  );

  // 9. Reject invalid slug formats in tenant ID
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: '-bp-kallis' }),
    /INVALID_TENANT_ID_FORMAT/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: 'bp-kallis-' }),
    /INVALID_TENANT_ID_FORMAT/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: 'bp' }),
    /INVALID_TENANT_ID_FORMAT/
  );
  assert.throws(
    () => validateOwnerConfirmationInput({ ownerUid: 'owner123', tenantId: 'bp_kallis' }),
    /INVALID_TENANT_ID_FORMAT/
  );

  console.log('All Owner Identity Validator Tests passed successfully!');
}

runTests();
