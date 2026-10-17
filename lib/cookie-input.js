const COOKIE_VALUE = /^[\x21-\x7E]+$/;

function normalizeCookieInput(input, expectedName) {
  if (typeof input !== "string") throw new Error(`Enter a ${expectedName} cookie value.`);
  const value = input.trim();
  if (!value) throw new Error(`Enter a ${expectedName} cookie value.`);
  const prefix = `${expectedName}=`;
  const otherNames = ["ct0", "auth_token"].filter((name) => name !== expectedName);
  if (value.startsWith(prefix)) {
    const normalized = value.slice(prefix.length).trim();
    if (!normalized) throw new Error(`The ${expectedName} cookie value is empty.`);
    if (!COOKIE_VALUE.test(normalized) || normalized.includes(";") || normalized.includes(",")) {
      throw new Error(`The ${expectedName} cookie value contains invalid characters.`);
    }
    return normalized;
  }
  if (otherNames.some((name) => value.startsWith(`${name}=`))) {
    throw new Error(`Paste the ${expectedName} cookie in the ${expectedName} field.`);
  }
  if (!COOKIE_VALUE.test(value) || value.includes(";") || value.includes(",")) {
    throw new Error(`The ${expectedName} cookie value contains invalid characters.`);
  }
  return value;
}

function normalizeManualCookies(ct0, authToken) {
  return {
    ct0: normalizeCookieInput(ct0, "ct0"),
    authToken: normalizeCookieInput(authToken, "auth_token"),
  };
}

module.exports = { normalizeCookieInput, normalizeManualCookies };
