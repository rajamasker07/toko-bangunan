/** Validate password meets backend policy (8-128 chars, contains letter and digit). */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'Kata sandi minimal harus 8 karakter.';
  }
  if (password.length > 128) {
    return 'Kata sandi maksimal 128 karakter.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Kata sandi harus mengandung minimal 1 huruf dan 1 angka.';
  }
  return null;
}

/** Validate username format (3-50 chars: lowercase letters, digits, dot, underscore, hyphen). */
export function validateUsernameFormat(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(normalized)) {
    return 'Username harus 3–50 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau strip (-).';
  }
  return null;
}
