const assignmentGenerations = new WeakMap();

/** Begin a new owner/source assignment for this image element. */
export function beginImageAssignment(image) {
  const generation = (assignmentGenerations.get(image) ?? 0) + 1;
  assignmentGenerations.set(image, generation);
  return generation;
}

/** Invalidate callbacks belonging to the previous owner/source assignment. */
export function invalidateImageAssignment(image) {
  return beginImageAssignment(image);
}

/** Check that an asynchronous image callback still belongs to this assignment. */
export function isCurrentImageAssignment(image, generation, source) {
  return assignmentGenerations.get(image) === generation && image.getAttribute("src") === source;
}
