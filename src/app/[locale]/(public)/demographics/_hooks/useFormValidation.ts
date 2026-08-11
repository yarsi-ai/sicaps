'use client';

import { useCallback, useState } from 'react';

interface ValidationErrors {
  usia?: string;
  jenisKelamin?: string;
  pendidikan?: string;
}

/** Inline validation for the demographics form. */
export function useFormValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateUsia = (value: string, errorMessage: string): boolean => {
    if (!value) {
      setErrors((prev) => ({ ...prev, usia: errorMessage }));
      return false;
    }
    const n = Number(value);
    const valid = Number.isInteger(n) && n >= 1 && n <= 120;
    setErrors((prev) => ({ ...prev, usia: valid ? undefined : errorMessage }));
    return valid;
  };

  const showError = useCallback((field: keyof ValidationErrors, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearError = useCallback((field: keyof ValidationErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  return { errors, validateUsia, showError, clearError };
}
