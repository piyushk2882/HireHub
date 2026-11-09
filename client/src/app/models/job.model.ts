export interface Company {
  _id: string;
  companyName: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  logo?: string;
  recruiterId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompaniesResponse {
  success: boolean;
  message?: string;
  data: {
    companies: Company[];
    pagination: PaginationMetadata;
  };
}

export interface SingleCompanyResponse {
  success: boolean;
  message?: string;
  data: {
    company: Company;
  };
}

export interface Job {
  _id?: string;
  id?: string | number;
  title: string;
  description: string;
  requirements?: string[];
  responsibilities?: string[];
  companyId?: Company | any;
  company?: string;
  recruiterId?: string;
  location: string;
  employmentType?: 'Full Time' | 'Part Time' | 'Contract' | 'Remote' | 'Hybrid' | 'Internship' | string;
  type?: string;
  experienceLevel?: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Executive' | string;
  salaryMin?: number;
  salaryMax?: number;
  salary?: string;
  category: 'Development' | 'Design' | 'Marketing' | 'Data Science' | 'Business' | 'Other' | string;
  skills: string[];
  applicationDeadline?: string;
  status?: 'Active' | 'Closed' | 'Draft' | 'Archived' | string;
  featured?: boolean;
  postedDate?: string;
  logoText?: string;
  logoBg?: string;
  logoColor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface JobsResponse {
  success: boolean;
  message?: string;
  data: {
    jobs: Job[];
    pagination: PaginationMetadata;
  };
}

export interface SingleJobResponse {
  success: boolean;
  message?: string;
  data: {
    job: Job;
    action?: string;
  };
}

export interface JobFilters {
  search?: string;
  location?: string;
  category?: string;
  employmentType?: string;
  experienceLevel?: string;
  minSalary?: number;
  maxSalary?: number;
  companyId?: string;
  status?: string;
  recruiterId?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'salary_asc' | 'salary_desc';
}

/**
 * Formats numeric salary bounds into user-friendly display string.
 */
export function formatSalary(min?: number, max?: number): string {
  if (min !== undefined && min !== null && max !== undefined && max !== null) {
    if (min >= 1000 && max >= 1000) {
      return `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k`;
    }
    return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  }
  if (min !== undefined && min !== null) {
    return `From $${min >= 1000 ? Math.round(min / 1000) + 'k' : min.toLocaleString()}`;
  }
  if (max !== undefined && max !== null) {
    return `Up to $${max >= 1000 ? Math.round(max / 1000) + 'k' : max.toLocaleString()}`;
  }
  return 'Competitive';
}

/**
 * Extracts company name cleanly whether populated object or string.
 */
export function getCompanyName(job: Job): string {
  if (job.companyId && typeof job.companyId === 'object' && job.companyId.companyName) {
    return job.companyId.companyName;
  }
  return job.company || 'Company Confidential';
}

/**
 * Generates initial letters and consistent background color for company avatar.
 */
export function getCompanyAvatarInfo(companyName: string): { text: string; bg: string; color: string } {
  const name = companyName || 'HireHub';
  const words = name.trim().split(/\s+/);
  let text = 'HH';
  if (words.length >= 2) {
    text = (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 1) {
    text = words[0].slice(0, 2).toUpperCase();
  }

  // Predefined accessible palette matching design tokens
  const colors = [
    { bg: '#EFF6FF', color: '#345CF0' },
    { bg: '#ECFDF5', color: '#059669' },
    { bg: '#F5F3FF', color: '#7C3AED' },
    { bg: '#FFFBEB', color: '#D97706' },
    { bg: '#FDF2F8', color: '#DB2777' },
    { bg: '#F0F9FF', color: '#0284C7' }
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return { text, bg: colors[index].bg, color: colors[index].color };
}
