// Edit this list to match the 13 schemes used in your PostMitra app.
// `id` is stored with each application; `name` is what users and admins see.
export const SCHEMES = [
  { id: 'sb',    name: 'Post Office Savings Account (SB)' },
  { id: 'rd',    name: 'Recurring Deposit (RD)' },
  { id: 'td1',   name: 'Time Deposit - 1 Year' },
  { id: 'td2',   name: 'Time Deposit - 2 Year' },
  { id: 'td3',   name: 'Time Deposit - 3 Year' },
  { id: 'td5',   name: 'Time Deposit - 5 Year' },
  { id: 'mis',   name: 'Monthly Income Scheme (MIS)' },
  { id: 'scss',  name: 'Senior Citizen Savings Scheme (SCSS)' },
  { id: 'ppf',   name: 'Public Provident Fund (PPF)' },
  { id: 'nsc',   name: 'National Savings Certificate (NSC)' },
  { id: 'kvp',   name: 'Kisan Vikas Patra (KVP)' },
  { id: 'ssy',   name: 'Sukanya Samriddhi Yojana (SSY)' },
  { id: 'mssc',  name: 'Mahila Samman Savings Certificate (MSSC)' },
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
