import { loadQuizAttempts, loadQuizzes } from './quizStore';

export const MODULES_STORAGE_KEY = 'wharfintel:lms-instructor-modules:v1';
export const LEARNER_PROGRESS_PREFIX = 'wharfintel:lms-progress:';
const LMS_FILES_DB = 'wharfintel-lms-files';
const LMS_FILES_STORE = 'attachments';
let filesDatabasePromise;

const openFilesDatabase = () => {
  if (!globalThis.indexedDB) return Promise.reject(new Error('File storage is unavailable in this browser.'));
  if (!filesDatabasePromise) {
    filesDatabasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(LMS_FILES_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(LMS_FILES_STORE)) {
          request.result.createObjectStore(LMS_FILES_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open browser file storage.'));
      request.onblocked = () => reject(new Error('File storage is blocked by another open tab.'));
    }).catch((error) => {
      filesDatabasePromise = null;
      throw error;
    });
  }
  return filesDatabasePromise;
};

export const saveLmsAttachment = async (file) => {
  const database = await openFilesDatabase();
  const id = globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const metadata = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(LMS_FILES_STORE, 'readwrite');
    transaction.objectStore(LMS_FILES_STORE).put({ ...metadata, file });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the attachment.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving the attachment was cancelled.'));
  });
  return metadata;
};

export const getLmsAttachment = async (id) => {
  const database = await openFilesDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(LMS_FILES_STORE, 'readonly').objectStore(LMS_FILES_STORE).get(id);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error || new Error('Could not load the attachment.'));
  });
};

export const deleteLmsAttachment = async (id) => {
  if (!id || !globalThis.indexedDB) return;
  const database = await openFilesDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(LMS_FILES_STORE, 'readwrite');
    transaction.objectStore(LMS_FILES_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove the attachment.'));
  });
};

const dateAfterDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const DEFAULT_MODULES = [
  {
    id: 'port-safety',
    title: 'Port Safety Protocols',
    description: 'Standardize safe access, berth operations, and hazard reporting across the terminal.',
    category: 'Port Safety',
    resourceUrl: '',
    sections: [
      { id: 'port-safety-1', title: 'Terminal hazard identification', description: '', resourceUrl: '' },
      { id: 'port-safety-2', title: 'Personal protective equipment', description: '', resourceUrl: '' },
      { id: 'port-safety-3', title: 'Berth and quay access', description: '', resourceUrl: '' },
      { id: 'port-safety-4', title: 'Safe cargo-area walkthroughs', description: '', resourceUrl: '' },
      { id: 'port-safety-5', title: 'Permit-to-work procedures', description: '', resourceUrl: '' },
      { id: 'port-safety-6', title: 'Incident reporting drill', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Port Operations · Batch 04',
    deadline: dateAfterDays(5),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'logistics-handling',
    title: 'Cargo Handling & Load Integrity',
    description: 'Review cargo documentation, safe handling practices, and transfer checks.',
    category: 'Logistics',
    resourceUrl: '',
    sections: [
      { id: 'logistics-1', title: 'Cargo manifest essentials', description: '', resourceUrl: '' },
      { id: 'logistics-2', title: 'Load planning and weight limits', description: '', resourceUrl: '' },
      { id: 'logistics-3', title: 'Cold-chain handling', description: '', resourceUrl: '' },
      { id: 'logistics-4', title: 'Hazardous goods segregation', description: '', resourceUrl: '' },
      { id: 'logistics-5', title: 'Seal checks and documentation', description: '', resourceUrl: '' },
      { id: 'logistics-6', title: 'Transfer and handoff controls', description: '', resourceUrl: '' },
      { id: 'logistics-7', title: 'Final dispatch assessment', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Cargo Team · Batch 02',
    deadline: dateAfterDays(12),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'emergency-response',
    title: 'Emergency Response Coordination',
    description: 'Practice escalation, vessel communications, and incident response roles.',
    category: 'Emergency Response',
    resourceUrl: '',
    sections: [
      { id: 'emergency-1', title: 'Command roles and escalation', description: '', resourceUrl: '' },
      { id: 'emergency-2', title: 'Vessel-to-shore communications', description: '', resourceUrl: '' },
      { id: 'emergency-3', title: 'Medical response coordination', description: '', resourceUrl: '' },
      { id: 'emergency-4', title: 'Fire and evacuation procedures', description: '', resourceUrl: '' },
      { id: 'emergency-5', title: 'Tabletop response exercise', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Shore Operations · All batches',
    deadline: dateAfterDays(9),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'port-security',
    title: 'Port Facility Security',
    description: 'Apply access-control, visitor screening, and suspicious-activity procedures.',
    category: 'Port Safety',
    displayCategory: 'SECURITY',
    accent: 'slate',
    resourceUrl: '',
    sections: [
      { id: 'port-security-1', title: 'Facility security levels', description: '', resourceUrl: '' },
      { id: 'port-security-2', title: 'Access control and credentials', description: '', resourceUrl: '' },
      { id: 'port-security-3', title: 'Visitor and contractor screening', description: '', resourceUrl: '' },
      { id: 'port-security-4', title: 'Security incident response', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Port Security · All batches',
    deadline: dateAfterDays(15),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vessel-traffic',
    title: 'Vessel Traffic Fundamentals',
    description: 'Read traffic patterns and support safe coordination in busy port approaches.',
    category: 'Vessel Operations',
    displayCategory: 'NAVIGATION',
    accent: 'green',
    resourceUrl: '',
    sections: [
      { id: 'vessel-traffic-1', title: 'Traffic service fundamentals', description: '', resourceUrl: '' },
      { id: 'vessel-traffic-2', title: 'AIS data and vessel identity', description: '', resourceUrl: '' },
      { id: 'vessel-traffic-3', title: 'Approach and movement planning', description: '', resourceUrl: '' },
      { id: 'vessel-traffic-4', title: 'Radio phraseology', description: '', resourceUrl: '' },
      { id: 'vessel-traffic-5', title: 'Near-miss prevention', description: '', resourceUrl: '' },
      { id: 'vessel-traffic-6', title: 'Knowledge assessment', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Vessel Traffic · All batches',
    deadline: dateAfterDays(21),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'marine-environment',
    title: 'Marine Environmental Care',
    description: 'Prevent spills and reduce operational impact on surrounding marine habitats.',
    category: 'Port Safety',
    displayCategory: 'ENVIRONMENT',
    accent: 'teal',
    resourceUrl: '',
    sections: [
      { id: 'marine-environment-1', title: 'Pollution prevention basics', description: '', resourceUrl: '' },
      { id: 'marine-environment-2', title: 'Spill-kit readiness', description: '', resourceUrl: '' },
      { id: 'marine-environment-3', title: 'Waste segregation at port', description: '', resourceUrl: '' },
      { id: 'marine-environment-4', title: 'Environmental incident reporting', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Environmental Operations · All batches',
    deadline: dateAfterDays(24),
    status: 'Active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vessel-operations',
    title: 'Vessel Operations Refresher',
    description: 'Draft module for vessel movement planning and port approach coordination.',
    category: 'Vessel Operations',
    resourceUrl: '',
    sections: [
      { id: 'vessel-operations-1', title: 'Vessel movement planning', description: '', resourceUrl: '' },
    ],
    targetAudience: 'Vessel Traffic · Batch 01',
    deadline: dateAfterDays(30),
    status: 'Draft',
    updatedAt: new Date().toISOString(),
  },
];

const COURSE_TITLES = {
  'port-safety': 'Port Safety Protocols',
  'emergency-response': 'Emergency Response',
  'logistics-handling': 'Cargo & Logistics Handling',
  'port-security': 'Port Facility Security',
  'vessel-traffic': 'Vessel Traffic Fundamentals',
  'marine-environment': 'Marine Environmental Care',
};

export const loadInstructorModules = () => {
  try {
    const stored = localStorage.getItem(MODULES_STORAGE_KEY);
    const parsed = stored === null ? [] : JSON.parse(stored);
    const savedModules = Array.isArray(parsed) ? parsed : [];
    const savedById = new Map(savedModules.map((module) => [module.id, module]));
    const defaultIds = new Set(DEFAULT_MODULES.map((module) => module.id));
    const modules = [
      ...DEFAULT_MODULES.map((defaultModule) => {
        const savedModule = savedById.get(defaultModule.id);
        return {
          ...defaultModule,
          ...savedModule,
          sections: Array.isArray(savedModule?.sections) ? savedModule.sections : defaultModule.sections,
        };
      }),
      ...savedModules
        .filter((module) => !defaultIds.has(module.id))
        .map((module) => ({
          ...module,
          sections: Array.isArray(module.sections) && module.sections.length
            ? module.sections
            : [{ id: `${module.id}-section-1`, title: module.title, description: module.description || '', resourceUrl: module.resourceUrl || '' }],
        })),
    ];

    localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modules));
    return modules;
  } catch {
    return DEFAULT_MODULES;
  }
};

export const saveInstructorModules = (modules) => {
  try {
    localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modules));
    return true;
  } catch {
    return false;
  }
};

export const loadLearnerProgress = (modules) => {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const quizById = new Map(loadQuizzes().map((quiz) => [quiz.id, quiz]));
  const quizAttempts = loadQuizAttempts();
  const today = new Date().toISOString().slice(0, 10);
  const learners = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LEARNER_PROGRESS_PREFIX)) continue;

      const studentName = key.slice(LEARNER_PROGRESS_PREFIX.length);
      let savedProgress;
      try {
        savedProgress = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {
        continue;
      }

      if (['admin', 'instructor'].includes(String(savedProgress.__role || '').toLowerCase())) continue;

      const activityCourseIds = Object.keys(savedProgress).filter((courseId) => !courseId.startsWith('__'));
      const assessmentCourseIds = Object.keys(savedProgress.__assessmentScores || {});
      const courseIds = Array.isArray(savedProgress.__enrolledCourses)
        ? [...new Set([...savedProgress.__enrolledCourses, ...assessmentCourseIds])]
        : [...new Set([...activityCourseIds, ...assessmentCourseIds])];
      courseIds.forEach((courseId) => {
        const lessonProgress = savedProgress[courseId];
        const sectionProgress = Array.isArray(lessonProgress)
          ? lessonProgress
          : lessonProgress && typeof lessonProgress === 'object'
            ? Object.values(lessonProgress)
            : [];

        const module = moduleById.get(courseId);
        const courseName = module?.title || COURSE_TITLES[courseId];
        if (!courseName) return;

        const completed = sectionProgress.filter(Boolean).length;
        const lessonPercent = sectionProgress.length ? Math.round((completed / sectionProgress.length) * 100) : 0;
        const assessmentScores = (quizAttempts[studentName] || [])
          .filter((attempt) => attempt.status === 'Graded' && quizById.get(attempt.quizId)?.courseId === courseId)
          .map((attempt) => Number(attempt.percentage))
          .filter((score) => Number.isFinite(score));
        const averageAssessmentScore = assessmentScores.length
          ? assessmentScores.reduce((total, score) => total + score, 0) / assessmentScores.length
          : null;
        const progress = averageAssessmentScore === null
          ? lessonPercent
          : Math.round((lessonPercent + averageAssessmentScore) / 2);
        const deadline = module?.deadline || '';
        const status = progress === 100
          ? 'Completed'
          : deadline && deadline < today
            ? 'Overdue'
            : 'On Track';

        learners.push({
          id: `${studentName}:${courseId}`,
          studentName,
          courseId,
          courseName,
          lessonPercent,
          averageAssessmentScore,
          progress,
          lastActivity: savedProgress.__lastActivity || '',
          status,
        });
      });
    }
  } catch {
    return [];
  }

  return learners.sort((left, right) => left.studentName.localeCompare(right.studentName));
};