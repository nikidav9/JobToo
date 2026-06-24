export type WorkType = 'stocker' | 'cook' | 'shift_supervisor' | 'picker';

export interface User {
  id: string;
  role: 'worker' | 'employer';
  phone: string;
  lastName: string;
  firstName: string;
  age?: number;
  metroLineId?: string;
  metroStation?: string;
  workTypes?: WorkType[];
  company?: string;
  createdAt: string;
  password?: string;
  isBlocked?: boolean;
  avatarUrl?: string;
  avgRating?: number;
  ratingCount?: number;
  bio?: string;
}

export interface Vacancy {
  id: string;
  employerId: string;
  company: string;
  title: string;
  workType: WorkType;
  workTypeLabel: string;
  metroLineId: string;
  metroStation: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  salary: number;
  normsAndPay: string;
  address?: string;
  workersNeeded: number;
  workersFound: number;
  isUrgent: boolean;
  noExperienceNeeded: boolean;
  conditions: string;
  status: 'open' | 'closed';
  createdAt: string;
}

export interface Like {
  id: string;
  vacancyId: string;
  workerId: string;
  employerId: string;
  workerLiked: boolean;
  employerLiked: boolean | null;
  workerSkipped: boolean;
  isMatch: boolean;
  matchedAt?: string;
  workerConfirmed?: boolean;
  employerConfirmed?: boolean;
  workerRated?: boolean;
  employerRated?: boolean;
  shiftCompleted?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  vacancyId: string;
  workerId: string;
  employerId: string;
  vacTitle: string;
  companyName: string;
  messages: Message[];
  unreadWorker: number;
  unreadEmployer: number;
  createdAt: string;
  bulletinId?: string;
  isLocked?: boolean;
}

export interface Bulletin {
  id: string;
  employerId: string;
  company: string;
  workType: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  metro: string;
  address: string;
  comment?: string;
  status: 'open' | 'closed';
  createdAt: string;
}

export interface Complaint {
  id: string;
  reporterId: string;
  reporterPhone: string;
  reporterCompany?: string;
  targetId: string;
  targetPhone: string;
  targetCompany?: string;
  complaintType: 'worker' | 'employer';
  description?: string;
  createdAt: string;
}

// ─── Permanent jobs ──────────────────────────────────────────────────────────

export interface PermVacancy {
  id: string;
  employerId: string;
  company: string;
  title: string;
  workType?: WorkType;
  metroLineId?: string;
  metroStation?: string;
  address?: string;
  salary: number;
  schedule: string;
  description?: string;
  status: 'open' | 'closed';
  createdAt: string;
}

export type PermApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface PermApplication {
  id: string;
  vacancyId: string;
  workerId: string;
  employerId: string;
  status: PermApplicationStatus;
  createdAt: string;
}

export interface Rating {
  id: string;
  fromUserId: string;
  toUserId: string;
  vacancyId: string;
  likeId: string;
  rating: number;
  role: 'worker' | 'employer';
  createdAt: string;
}
