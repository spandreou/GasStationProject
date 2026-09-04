export function allPersistenceResultsSucceeded(results = []) {
  return Array.isArray(results) && results.every((result) => result === true);
}

export async function persistValidatedSchedule({ generationResult, persist } = {}) {
  let validation = generationResult?.validation;
  if (typeof generationResult?.revalidateCandidate === 'function') {
    validation = await generationResult.revalidateCandidate();
  }
  const errorViolations = Array.isArray(validation?.violations)
    ? validation.violations.filter((violation) => violation?.severity === 'error')
    : [];

  if (!validation || validation.valid !== true || errorViolations.length > 0) {
    return {
      ok: false,
      persisted: false,
      violations: Array.isArray(validation?.violations) ? validation.violations : [],
    };
  }

  if (typeof persist !== 'function') {
    throw new TypeError('persistValidatedSchedule requires a persist callback.');
  }

  const value = await persist(generationResult);
  return {
    ok: true,
    persisted: true,
    value,
  };
}
