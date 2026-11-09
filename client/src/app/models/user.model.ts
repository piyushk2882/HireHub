export type UserRole = 'job_seeker' | 'recruiter' | 'admin';

export interface User {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  profileImage?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: User;
  };
}
