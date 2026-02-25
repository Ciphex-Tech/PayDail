export function assertIsNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

export function assertPassword(value: unknown) {
  const password = assertIsNonEmptyString(value, "password");
  if (password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  if (!/[a-z]/.test(password)) {
    throw new Error("password must include a lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error("password must include an uppercase letter");
  }

  if (!/\d/.test(password)) {
    throw new Error("password must include a number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("password must include a symbol");
  }

  return password;
}

export function assertPasswordReset(value: unknown) {
  const password = assertIsNonEmptyString(value, "password");
  if (password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  if (!/[a-z]/.test(password)) {
    throw new Error("password must include a lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error("password must include an uppercase letter");
  }

  if (!/\d/.test(password)) {
    throw new Error("password must include a number");
  }

  return password;
}
