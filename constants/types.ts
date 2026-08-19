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
  telegramId?: number;
  /** Когда пользователь последний раз был в приложении */
  lastSeenAt?: string;

  // ─── JobToo Score ───────────────────────────────────────────────────────
  // Считает сервер после каждой смены и каждой оценки; приложение только
  // показывает. Пусто — отработанных смен ещё меньше трёх, и любое число
  // здесь было бы выдумкой (см. миграцию 037).
  /** 0–100. */
  score?: number;
  /** Сколько смен отработано — знаменатель всего остального. */
  scoreShifts?: number;
  /** Доли 0–1 по осям. */
  scoreReliability?: number;
  scorePunctuality?: number;
  scoreQuality?: number;
  scoreSpeed?: number;
  /** У скольких разных работодателей работал. */
  scoreEmployers?: number;
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
  lat?: number;
  lng?: number;
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
  cancelled?: boolean;
  // Чем смена кончилась на самом деле. `shiftCompleted`/`cancelled` — то же
  // самое, но грубее: по ним не отличить невыход от отмены работодателем.
  outcome?: ShiftOutcome;
  // Минуты опоздания. 0 — пришёл вовремя, не задано — не спрашивали
  // (все смены до августа 2026).
  lateMinutes?: number;
  outcomeAt?: string;
}

/**
 * Исход смены. Отдельные значения вместо одной галочки «отменена» нужны
 * рейтингу: невыход — это про работника, отмена работодателем — про
 * работодателя, а предупредивший отказ не позорит никого.
 *
 * `cancelled_legacy` — то, что отменили до появления причин. Причину тогда
 * не спрашивали, поэтому в статистику такие смены не идут вовсе.
 */
export type ShiftOutcome =
  | 'worked'
  | 'no_show'
  | 'worker_cancelled'
  | 'employer_cancelled'
  | 'cancelled_legacy';

/** Что работодатель может отметить руками. `cancelled_legacy` только читается. */
export type ReportableOutcome = Exclude<ShiftOutcome, 'cancelled_legacy'>;

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
  // Когда каждая сторона в последний раз открывала переписку. Отсюда
  // галочки: своё сообщение прочитано, если оно старше отметки собеседника.
  // Пусто — собеседник ещё ни разу не заходил, и относиться галочке не к чему.
  workerReadAt?: string;
  employerReadAt?: string;
  createdAt: string;
  // Остались от удалённого раздела «Биржа»: два старых чата заведены оттуда.
  // Вакансии у них нет, и по этим полям чат это про себя и понимает.
  bulletinId?: string;
  workerSlotId?: string;
  isLocked?: boolean;
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
  lat?: number;
  lng?: number;
  salary: number;
  schedule: string;
  description?: string;
  status: 'open' | 'closed';
  createdAt: string;
}

/**
 * Вакансия из чужого сервиса.
 *
 * Отдельный тип, а не `Vacancy` с флажком, ровно по той же причине, по какой
 * они лежат в отдельной таблице (см. миграцию 031): на неё нельзя
 * откликнуться, у неё нет работодателя в нашей базе, нет переписки и нет
 * счётчика набранных. Если бы она приходила под видом обычной вакансии,
 * любой забытый фильтр давал бы человеку кнопку «Откликнуться», за которой
 * ничего нет.
 */
export interface ExternalVacancy {
  id: string;
  sourceId: string;
  /** Как называется источник — это видно на карточке. */
  sourceName?: string;
  title: string;
  company?: string;
  /** Станция из нашего справочника. Пусто — источник прислал что-то,
   *  чего мы не узнали; тогда для показа годится metroStationRaw. */
  metroStation?: string;
  /** Как станцию назвал источник. Только для показа: фильтр сравнивает
   *  точным равенством, и по этой строке он не совпал бы ни с чем. */
  metroStationRaw?: string;
  metroLineId?: string;
  /** Профессия, если заголовок на неё похож. Пусто — не разобрали. */
  workType?: WorkType;
  address?: string;
  lat?: number;
  lng?: number;
  /** shift — смена на дату, permanent — постоянная работа. */
  kind: 'shift' | 'permanent';
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  salary?: number;
  /** За что платят: shift | hour | month. */
  payPeriod?: string;
  schedule?: string;
  description?: string;
  /** Куда уводим. Без него карточка бессмысленна. */
  url: string;
  /** Когда источник в последний раз показывал её живой. */
  lastSeenAt?: string;
  /** Отпечаток «та же самая работа»: по нему прячем дубли из разных
   *  источников. Считает сборщик, см. php-proxy/ingest.php. */
  dedupeKey?: string;
}

// hired — работодатель нажал «Завершить»: кандидат закрыт, карточка ушла из
// «Мэтчей» в «Завершённые». Сама вакансия при этом остаётся в поиске, закрыть
// её можно во вкладке «Активные».
export type PermApplicationStatus = 'pending' | 'approved' | 'rejected' | 'hired';

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
