export type FieldKind = 'text' | 'date' | 'phone' | 'email';
export type FieldCategory = 'Identity' | 'Contact' | 'Education' | 'Emergency';

export type FieldDefinition = {
  key: string;
  label: string;
  category: FieldCategory;
  kind: FieldKind;
  optionalInVault?: boolean;
  sensitive?: boolean;
};

export const FIELD_REGISTRY = [
  { key: 'full_name', label: 'Full name', category: 'Identity', kind: 'text' },
  { key: 'preferred_name', label: 'Preferred name', category: 'Identity', kind: 'text', optionalInVault: true },
  { key: 'date_of_birth', label: 'Date of birth', category: 'Identity', kind: 'date', sensitive: true },
  { key: 'gender', label: 'Gender', category: 'Identity', kind: 'text', optionalInVault: true },
  { key: 'nationality', label: 'Nationality', category: 'Identity', kind: 'text', optionalInVault: true },
  { key: 'phone', label: 'Phone number', category: 'Contact', kind: 'phone' },
  { key: 'email', label: 'Email', category: 'Contact', kind: 'email' },
  { key: 'address', label: 'Address', category: 'Contact', kind: 'text' },
  { key: 'city', label: 'City', category: 'Contact', kind: 'text' },
  { key: 'state', label: 'State', category: 'Contact', kind: 'text' },
  { key: 'postal_code', label: 'Postal code', category: 'Contact', kind: 'text' },
  { key: 'country', label: 'Country', category: 'Contact', kind: 'text' },
  { key: 'institution', label: 'School', category: 'Education', kind: 'text' },
  { key: 'grade', label: 'Grade / year', category: 'Education', kind: 'text' },
  { key: 'student_id', label: 'Student ID', category: 'Education', kind: 'text', sensitive: true },
  { key: 'course', label: 'Course / program', category: 'Education', kind: 'text', optionalInVault: true },
  { key: 'emergency_name', label: 'Emergency contact', category: 'Emergency', kind: 'text' },
  { key: 'emergency_relationship', label: 'Relationship', category: 'Emergency', kind: 'text' },
  { key: 'emergency_phone', label: 'Emergency phone', category: 'Emergency', kind: 'phone' },
  { key: 'emergency_email', label: 'Emergency email', category: 'Emergency', kind: 'email', optionalInVault: true },
] as const satisfies readonly FieldDefinition[];

export type FieldKey = (typeof FIELD_REGISTRY)[number]['key'];
export const FIELD_BY_KEY = Object.fromEntries(FIELD_REGISTRY.map((field) => [field.key, field])) as Record<FieldKey, (typeof FIELD_REGISTRY)[number]>;
export const getField = (key: string): FieldDefinition | undefined => FIELD_REGISTRY.find((field) => field.key === key);

export type Vault = Partial<Record<FieldKey, string>>;
export function vaultFromRows(rows: readonly { field_key: string; value: string }[]): Vault {
  const vault: Vault = {};
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(FIELD_BY_KEY, row.field_key) && typeof row.value === 'string') {
      vault[row.field_key as FieldKey] = row.value;
    }
  }
  return vault;
}

export const demoVault: Vault = {
  full_name: 'Alex Morgan', preferred_name: 'Alex', date_of_birth: '2009-03-14',
  phone: '+1 (555) 013-2846', email: 'alex.morgan@example.test', address: '48 Cedar Lane',
  city: 'Fairview', state: 'Oregon', postal_code: '97024', country: 'United States',
  institution: 'Northfield Academy', grade: '11', emergency_name: 'Jordan Morgan',
  emergency_relationship: 'Parent', emergency_phone: '+1 (555) 013-9271',
};

export function validateField(key: FieldKey, value: string): string | null {
  const trimmed = value.trim();
  const field = FIELD_BY_KEY[key];
  if (!trimmed) return ('optionalInVault' in field && field.optionalInVault) ? null : `${field.label} is required.`;
  if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
  if (field.kind === 'phone' && !/^\+?[\d ()-]{7,20}$/.test(trimmed)) return 'Enter a valid phone number.';
  if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'Use YYYY-MM-DD for this date.';
  return null;
}

/** Clearing a Vault value removes it; requiredness is enforced when a request is approved. */
export function validateVaultEdit(key: FieldKey, value: string): string | null {
  return value.trim() ? validateField(key, value) : null;
}
