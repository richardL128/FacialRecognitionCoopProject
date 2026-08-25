export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export function sanitizePinInput(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, PIN_MAX_LENGTH);
}

export function isValidPin(pinCode: string): boolean {
  return /^[0-9]{4,6}$/u.test(pinCode);
}
