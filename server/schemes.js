// Edit this list to match the 13 schemes used in your PostMitra app.
// `id` is stored with each application; `name` is what users and admins see.
export const SCHEMES = [
  { id: 'ssy',    name: 'Sukanya Samriddhi Yojana' },
  { id: 'scss',   name: 'Senior Citizens Savings Scheme' },
  { id: 'mis',    name: 'Post Office Monthly Income Scheme' },
  { id: 'ppf',    name: 'Public Provident Fund' },
  { id: 'nsc',    name: 'National Savings Certificate' },
  { id: 'kvp',    name: 'Kisan Vikas Patra' },
  { id: 'rd',     name: 'Post Office Recurring Deposit' },
  { id: 'td-1yr', name: 'Time Deposit - 1 Year' },
  { id: 'td-2yr', name: 'Time Deposit - 2 Year' },
  { id: 'td-3yr', name: 'Time Deposit - 3 Year' },
  { id: 'td-5yr', name: 'Time Deposit - 5 Year' },
  { id: 'sb',     name: 'Post Office Savings Account' },
  { id: 'msc',    name: 'Mahila Samman Savings Certificate' },
];

export const DOCUMENTS = ['aadhaar', 'photo', 'address_proof', 'pan', 'age_proof', 'nominee_details'];

export const STATUSES = [
  'submitted',
  'in_review',
  'docs_needed',
  'appointment_confirmed',
  'completed',
  'rejected',
  'cancelled',
];
// Statuses after which the applicant can no longer cancel.
export const FINAL_STATUSES = ['completed', 'rejected', 'cancelled'];
