import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  deleteLmsAttachment,
  loadInstructorModules,
  loadLearnerProgress,
  saveLmsAttachment,
  saveInstructorModules,
} from './lmsStore';
import { isAwaitingInstructorReview, loadQuizAttempts, loadQuizzes, QUIZZES_STORAGE_KEY } from './quizStore';
import { StudentManagement, SubmissionChecking } from './InstructorManagementViews';
import './InstructorLMSPage.css';

const MotionDiv = motion.div;
const MotionSection = motion.section;
const MotionArticle = motion.article;

const CATEGORIES = ['Port Safety', 'Logistics', 'Emergency Response', 'Vessel Operations'];
const MODULE_FILTERS = ['All Modules', 'Active', 'Drafts'];

const countPendingQuizReviews = () => {
  try {
    return Object.values(loadQuizAttempts()).reduce((total, attempts) => (
      total + (Array.isArray(attempts) ? attempts.filter(isAwaitingInstructorReview).length : 0)
    ), 0);
  } catch {
    return 0;
  }
};

const createSection = (title = '') => ({
  id: globalThis.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title,
  description: '',
  resourceUrl: '',
});

const blankModule = () => ({
  title: '',
  description: '',
  category: CATEGORIES[0],
  resourceUrl: '',
  targetAudience: '',
  deadline: '',
  status: 'Draft',
  sections: [createSection('Lesson 1')],
});

const formatDate = (value) => {
  if (!value) return 'No deadline';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const getDeadlineTone = (value) => {
  if (!value) return 'no-date';
  const today = new Date().toISOString().slice(0, 10);
  const remainingDays = Math.ceil((new Date(`${value}T23:59:59`) - new Date()) / 86400000);
  if (value < today) return 'late';
  if (remainingDays <= 7) return 'soon';
  return 'normal';
};

const Icon = ({ name }) => {
  const paths = {
    modules: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
    students: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    deadline: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    back: <><path d="m15 18-6-6 6-6M9 12h11" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const ModuleModal = ({ module, mode, onClose, onSave }) => {
  const [form, setForm] = useState(() => module
    ? {
      ...module,
      sections: Array.isArray(module.sections) && module.sections.length
        ? module.sections.map((section) => ({ ...section }))
        : [createSection('Lesson 1')],
    }
    : blankModule());
  const deadlineOnly = mode === 'deadline';
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const updateSection = (sectionId, field, value) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) => (
        section.id === sectionId ? { ...section, [field]: value } : section
      )),
    }));
  };

  const addSection = () => {
    setForm((current) => ({
      ...current,
      sections: [...current.sections, createSection(`Lesson ${current.sections.length + 1}`)],
    }));
  };

  const removeSection = (sectionId) => {
    setForm((current) => current.sections.length > 1
      ? { ...current, sections: current.sections.filter((section) => section.id !== sectionId) }
      : current);
  };

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError('');
    try {
      await onSave(form);
    } catch (error) {
      setFormError(error.message || 'Could not save this module.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MotionDiv className="instructor-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <MotionSection className="instructor-modal" role="dialog" aria-modal="true" aria-labelledby="instructor-modal-title" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}>
        <header className="instructor-modal-header">
          <div>
            <p className="instructor-eyebrow">COURSE CONTENT / CONTROL</p>
            <h2 id="instructor-modal-title">{deadlineOnly ? 'Set module deadline' : module ? 'Edit module' : 'Add new module'}</h2>
          </div>
          <button className="instructor-icon-button" type="button" onClick={onClose} aria-label="Close module form">×</button>
        </header>
        <form className="instructor-module-form" onSubmit={submit}>
          {!deadlineOnly && (
            <>
              <label className="instructor-field instructor-field-wide">
                <span>Module title <i>*</i></span>
                <input name="title" value={form.title} onChange={updateField} maxLength={100} placeholder="e.g. Safe cargo transfer" required />
              </label>
              <label className="instructor-field instructor-field-wide">
                <span>Description <i>*</i></span>
                <textarea name="description" value={form.description} onChange={updateField} maxLength={600} rows={3} placeholder="What learners will cover in this module" required />
              </label>
              <label className="instructor-field">
                <span>Course category <i>*</i></span>
                <select name="category" value={form.category} onChange={updateField} required>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="instructor-field">
                <span>Target audience <i>*</i></span>
                <input name="targetAudience" value={form.targetAudience} onChange={updateField} maxLength={100} placeholder="Role or batch" required />
              </label>
              <section className="instructor-sections-field instructor-field-wide" aria-labelledby="module-sections-title">
                <div className="instructor-sections-heading">
                  <div>
                    <span id="module-sections-title">Sections / lessons <i>*</i></span>
                    <small>Add a title and a resource link for each lesson.</small>
                  </div>
                  <button className="instructor-add-section" type="button" onClick={addSection}>
                    <Icon name="plus" /> Add Section
                  </button>
                </div>
                <div className="instructor-section-fields">
                  {form.sections.map((section, index) => (
                    <fieldset className="instructor-section-fieldset" key={section.id}>
                      <legend>Lesson {index + 1}</legend>
                      <label className="instructor-field">
                        <span>Section title <i>*</i></span>
                        <input value={section.title} onChange={(event) => updateSection(section.id, 'title', event.target.value)} maxLength={120} placeholder={`Lesson ${index + 1}: Introduction`} required />
                      </label>
                      <label className="instructor-field instructor-file-field">
                        <span>File attachment</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.mp4,.mov,.webm,application/pdf,video/*"
                          onChange={(event) => updateSection(section.id, 'pendingFile', event.target.files?.[0] || null)}
                        />
                        <small>{section.pendingFile?.name || section.attachment?.name || 'PDF, document, presentation, or video'}</small>
                        {section.resourceUrl && !section.attachment && !section.pendingFile && (
                          <a href={section.resourceUrl} target="_blank" rel="noreferrer">Open existing link</a>
                        )}
                        {section.attachment && !section.pendingFile && (
                          <button className="instructor-remove-section" type="button" onClick={() => updateSection(section.id, 'attachment', null)}>Remove attached file</button>
                        )}
                      </label>
                      <label className="instructor-field instructor-field-wide">
                        <span>Lesson details</span>
                        <textarea value={section.description} onChange={(event) => updateSection(section.id, 'description', event.target.value)} maxLength={500} rows={2} placeholder="What this lesson covers" />
                      </label>
                      <button className="instructor-remove-section" type="button" onClick={() => removeSection(section.id)} disabled={form.sections.length <= 1} aria-label={`Remove Lesson ${index + 1}`}>
                        Remove lesson
                      </button>
                    </fieldset>
                  ))}
                </div>
              </section>
            </>
          )}
          <label className="instructor-field instructor-field-wide">
            <span>Completion deadline <i>*</i></span>
            <input name="deadline" type="date" value={form.deadline} onChange={updateField} required />
          </label>
          {!deadlineOnly && (
            <label className="instructor-field instructor-field-wide">
              <span>Publishing status</span>
              <select name="status" value={form.status} onChange={updateField}>
                <option value="Draft">Save as draft</option>
                <option value="Active">Publish to learners</option>
              </select>
            </label>
          )}
          <footer className="instructor-modal-footer">
            <button className="instructor-button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="instructor-button primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : deadlineOnly ? 'Save deadline' : module ? 'Save changes' : 'Create module'}</button>
          </footer>
          {formError && <p className="instructor-form-error" role="alert">{formError}</p>}
        </form>
      </MotionSection>
    </MotionDiv>
  );
};

const InstructorLMSPage = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const role = (localStorage.getItem('role') || '').toLowerCase();
  const authorized = role === 'admin' || role === 'instructor';
  const [modules, setModules] = useState(() => loadInstructorModules());
  const [filter, setFilter] = useState('All Modules');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [, setRefreshTick] = useState(0);
  const [notice, setNotice] = useState('');
  const [quizzes, setQuizzes] = useState([]);
  const [activeTab, setActiveTab] = useState(() => (
    countPendingQuizReviews() ? 'submissions' : 'courses'
  ));
  const pendingQuizReviews = countPendingQuizReviews();

  useEffect(() => {
    const refreshQuizzes = (event) => {
      if (event?.key && event.key !== QUIZZES_STORAGE_KEY) return;
      try {
        setQuizzes(loadQuizzes());
      } catch (error) {
        setNotice(error.message || 'Could not load assessment data.');
      }
    };
    refreshQuizzes();
    window.addEventListener('storage', refreshQuizzes);
    return () => window.removeEventListener('storage', refreshQuizzes);
  }, []);

  useEffect(() => {
    saveInstructorModules(modules);
  }, [modules]);

  useEffect(() => {
    const refresh = () => setRefreshTick((tick) => tick + 1);
    window.addEventListener('storage', refresh);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(interval);
    };
  }, []);

  const learners = loadLearnerProgress(modules);
  const visibleModules = modules.filter((module) => module.status !== 'Deleted').filter((module) => {
    const matchesFilter = filter === 'All Modules' || module.status === filter.replace(/s$/, '');
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${module.title} ${module.category} ${module.targetAudience}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  const activeModules = modules.filter((module) => module.status === 'Active');
  const enrolledStudents = new Set(learners.map((learner) => learner.studentName)).size;
  const pendingSubmissions = learners.filter((learner) => learner.status !== 'Completed').length;
  const approachingDeadlines = activeModules.filter((module) => {
    if (!module.deadline) return false;
    const today = new Date().toISOString().slice(0, 10);
    const remaining = Math.ceil((new Date(`${module.deadline}T23:59:59`) - new Date()) / 86400000);
    return module.deadline >= today && remaining <= 7;
  }).length;

  const getModuleRate = (moduleId) => {
    const moduleLearners = learners.filter((learner) => learner.courseId === moduleId);
    if (!moduleLearners.length) return 0;
    return Math.round(moduleLearners.reduce((total, learner) => total + learner.progress, 0) / moduleLearners.length);
  };

  const saveModule = async (form) => {
    const currentModule = modal.module;
    const sections = [];
    for (const section of form.sections) {
      const { pendingFile, ...savedSection } = section;
      if (pendingFile) {
        savedSection.attachment = await saveLmsAttachment(pendingFile);
        savedSection.resourceUrl = '';
      }
      sections.push(savedSection);
    }

    if (currentModule) {
      const retainedAttachments = new Set(sections.map((section) => section.attachment?.id).filter(Boolean));
      await Promise.all((currentModule.sections || [])
        .map((section) => section.attachment?.id)
        .filter((id) => id && !retainedAttachments.has(id))
        .map(deleteLmsAttachment));
    }

    const savedForm = { ...form, sections, updatedAt: new Date().toISOString() };
    if (modal.mode === 'deadline') {
      setModules((current) => current.map((module) => (
        module.id === modal.module.id ? { ...module, deadline: form.deadline, updatedAt: new Date().toISOString() } : module
      )));
    } else if (modal.module) {
      setModules((current) => current.map((module) => (
        module.id === modal.module.id ? { ...module, ...savedForm } : module
      )));
    } else {
      const id = globalThis.crypto?.randomUUID?.() || `module-${Date.now()}`;
      setModules((current) => [{ ...savedForm, id }, ...current]);
    }
    setModal(null);
    setNotice(modal.mode === 'deadline' ? 'Deadline updated.' : modal.module ? 'Module updated.' : 'Module created.');
    window.setTimeout(() => setNotice(''), 2800);
  };

  const deleteModule = (module) => {
    if (!window.confirm(`Delete “${module.title}”? This removes it from the learner course list.`)) return;
    setModules((current) => current.map((item) => (
      item.id === module.id ? { ...item, status: 'Deleted', updatedAt: new Date().toISOString() } : item
    )));
    setNotice('Module deleted.');
    window.setTimeout(() => setNotice(''), 2800);
  };

  const openQuizBuilder = (quiz) => {
    const query = quiz ? `?quizId=${encodeURIComponent(quiz.id)}` : '';
    window.open(`/lms/instructor/quiz-builder${query}`, '_blank', 'noopener,noreferrer');
  };

  const courseTitle = (courseId) => modules.find((module) => module.id === courseId)?.title || 'General assessment';

  const metrics = [
    { label: 'Total Modules Active', value: activeModules.length, detail: `${modules.filter((module) => module.status === 'Draft').length} drafts`, icon: 'modules', tone: 'cyan' },
    { label: 'Total Enrolled Students', value: enrolledStudents, detail: 'Learners with course activity', icon: 'students', tone: 'blue' },
    { label: 'Pending Submissions', value: pendingSubmissions, detail: 'Incomplete learner modules', icon: 'pending', tone: 'amber' },
    { label: 'Approaching Deadlines', value: approachingDeadlines, detail: 'Due in the next 7 days', icon: 'deadline', tone: 'rose' },
  ];

  const entrance = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    navigate('/');
  };

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  if (!authorized) {
    return (
      <div className="instructor-page">
        <section className="instructor-access-panel">
          <p className="instructor-eyebrow">RESTRICTED WORKSPACE</p>
          <h1>Instructor access required</h1>
          <p>Sign in with an instructor or admin account to manage training modules.</p>
          <button className="instructor-button primary" type="button" onClick={() => navigate('/')}>Back to home page</button>
        </section>
      </div>
    );
  }

  return (
    <div className="instructor-page">
      <div className="instructor-shell">
        <header className="instructor-topbar">
          <button className="instructor-back-button" type="button" onClick={handleLogout}>
            <Icon name="back" /> Logout
          </button>
          <div className="instructor-topbar-actions">
            <button className="instructor-button primary instructor-add-button" type="button" onClick={() => setModal({ mode: 'create', module: null })}>
              <Icon name="plus" /> Add New Module
            </button>
            <button className="instructor-button primary instructor-quiz-create" type="button" onClick={() => openQuizBuilder(null)}>
              <Icon name="plus" /> Create New Quiz / Exam
            </button>
          </div>
        </header>

        <div className="instructor-content-scroll">
        <MotionSection className="instructor-heading" {...entrance} transition={{ duration: 0.3 }}>
          <div>
            <p className="instructor-eyebrow"><span /> TRAINING OPERATIONS / INSTRUCTOR PORTAL</p>
            <h1>Instructor Dashboard</h1>
            <p>Manage course delivery, deadlines, and crew progress.</p>
          </div>
          <span className="instructor-live-indicator"><i /> LOCAL COURSE DATA</span>
        </MotionSection>

        <nav className="instructor-main-tabs" aria-label="Instructor dashboard sections">
          <button type="button" className={activeTab === 'courses' ? 'selected' : ''} onClick={() => setActiveTab('courses')} aria-current={activeTab === 'courses' ? 'page' : undefined}>Course Management</button>
          <button type="button" className={activeTab === 'submissions' ? 'selected' : ''} onClick={() => setActiveTab('submissions')} aria-current={activeTab === 'submissions' ? 'page' : undefined}>
            Submission Checking{pendingQuizReviews > 0 && <span className="instructor-tab-count">{pendingQuizReviews}</span>}
          </button>
          <button type="button" className={activeTab === 'students' ? 'selected' : ''} onClick={() => setActiveTab('students')} aria-current={activeTab === 'students' ? 'page' : undefined}>Student Management</button>
        </nav>

        {activeTab === 'submissions' && <SubmissionChecking modules={modules} quizzes={quizzes} onNotice={showNotice} />}
        {activeTab === 'students' && <StudentManagement modules={modules} quizzes={quizzes} onNotice={showNotice} />}

        {activeTab === 'courses' && <>
        <section className="instructor-metrics" aria-label="Instructor metrics">
          {metrics.map((metric, index) => (
            <MotionArticle className="instructor-metric-card" key={metric.label} {...entrance} transition={{ delay: reduceMotion ? 0 : index * 0.055, duration: 0.28 }}>
              <div className="instructor-metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>
              <span className={`instructor-metric-icon tone-${metric.tone}`}><Icon name={metric.icon} /></span>
            </MotionArticle>
          ))}
        </section>

        <section className="instructor-panel" aria-labelledby="instructor-modules-heading">
          <div className="instructor-section-head">
            <div><p className="instructor-eyebrow">CONTENT CONTROL</p><h2 id="instructor-modules-heading">Course &amp; module management</h2></div>
            <label className="instructor-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search modules" aria-label="Search modules" /></label>
          </div>
          <div className="instructor-toolbar">
            <div className="instructor-tabs" role="group" aria-label="Filter modules">
              {MODULE_FILTERS.map((tab) => (
                <button key={tab} type="button" className={filter === tab ? 'selected' : ''} onClick={() => setFilter(tab)} aria-pressed={filter === tab}>{tab}</button>
              ))}
            </div>
            <span className="instructor-count">{visibleModules.length} MODULE{visibleModules.length === 1 ? '' : 'S'}</span>
          </div>
          <div className="instructor-table-wrap">
            <table className="instructor-table">
              <thead><tr><th>Module</th><th>Target role / batch</th><th>Assigned deadline</th><th>Completion</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visibleModules.map((module) => {
                  const rate = getModuleRate(module.id);
                  const dueTone = getDeadlineTone(module.deadline);
                  return (
                    <tr key={module.id}>
                      <td><div className="instructor-module-name"><strong>{module.title}</strong><span>{module.category}{module.resourceUrl && <a href={module.resourceUrl} target="_blank" rel="noreferrer" aria-label={`Open learning resource for ${module.title}`}><Icon name="external" /></a>}</span></div></td>
                      <td><span className="instructor-audience">{module.targetAudience}</span></td>
                      <td><span className={`instructor-deadline tone-${dueTone}`}><Icon name="calendar" />{formatDate(module.deadline)}</span></td>
                      <td><div className="instructor-completion"><span><i style={{ width: `${rate}%` }} /></span><strong>{rate}%</strong></div><small className="instructor-learner-count">{learners.filter((learner) => learner.courseId === module.id).length} learners</small></td>
                      <td><span className={`instructor-status status-${module.status.toLowerCase()}`}>{module.status}</span></td>
                      <td><div className="instructor-actions">
                        <button type="button" onClick={() => setModal({ mode: 'edit', module })} aria-label={`Edit ${module.title}`} title="Edit module"><Icon name="edit" /></button>
                        <button type="button" onClick={() => setModal({ mode: 'deadline', module })} aria-label={`Set deadline for ${module.title}`} title="Set deadline"><Icon name="calendar" /></button>
                        <button className="delete-action" type="button" onClick={() => deleteModule(module)} aria-label={`Delete ${module.title}`} title="Delete module"><Icon name="trash" /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleModules.length === 0 && <p className="instructor-empty">No modules in this view. Add a module to start building your training plan.</p>}
          </div>
        </section>

        <section className="instructor-panel instructor-quiz-panel" aria-labelledby="instructor-quizzes-heading">
          <div className="instructor-section-head">
            <div><p className="instructor-eyebrow">ASSESSMENT CONTROL</p><h2 id="instructor-quizzes-heading">Quiz &amp; Exam Manager</h2></div>
          </div>
          <div className="instructor-assessment-list">
            {quizzes.map((quiz) => (
              <article className="instructor-assessment-row" key={quiz.id}>
                <div><strong>{quiz.title}</strong><span>{courseTitle(quiz.courseId)} · {quiz.questions?.length || 0} questions · {quiz.timeLimit} min</span></div>
                <span className={`instructor-status status-${String(quiz.status).toLowerCase()}`}>{quiz.status}</span>
                <button className="instructor-button secondary" type="button" onClick={() => openQuizBuilder(quiz)}>Edit in new tab <Icon name="external" /></button>
              </article>
            ))}
            {quizzes.length === 0 && <p className="instructor-empty">No quizzes or exams yet. Create an assessment to assign it to a course.</p>}
          </div>
        </section>

        <section className="instructor-panel instructor-students-panel" aria-labelledby="instructor-students-heading">
          <div className="instructor-section-head">
            <div><p className="instructor-eyebrow">LEARNER ACTIVITY</p><h2 id="instructor-students-heading">Student progress tracker</h2></div>
            <span className="instructor-count">{learners.length} ENROLLMENT{learners.length === 1 ? '' : 'S'}</span>
          </div>
          <div className="instructor-table-wrap">
            <table className="instructor-table student-table">
              <thead><tr><th>Student name</th><th>Enrolled course</th><th>Progress</th><th>Last activity</th><th>Status</th></tr></thead>
              <tbody>
                {learners.map((learner) => (
                  <tr key={learner.id}>
                    <td><span className="instructor-student-name"><i>{learner.studentName.slice(0, 1).toUpperCase()}</i>{learner.studentName}</span></td>
                    <td>{learner.courseName}</td>
                    <td><div className="instructor-completion student-completion"><span><i style={{ width: `${learner.progress}%` }} /></span><strong>{learner.progress}%</strong></div></td>
                    <td>{learner.lastActivity ? formatDate(learner.lastActivity.slice(0, 10)) : 'Not recorded'}</td>
                    <td><span className={`instructor-status student-status status-${learner.status.toLowerCase().replace(' ', '-')}`}>{learner.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {learners.length === 0 && <p className="instructor-empty">No learner progress is recorded yet. Student activity will appear here as they complete modules.</p>}
          </div>
        </section>

        <p className="instructor-data-note">Progress is read from learner activity saved in this browser. Connect an LMS API for shared, multi-device records.</p>
        </>}
        </div>
      </div>

      <AnimatePresence>
        {modal && <ModuleModal key={`${modal.mode}-${modal.module?.id || 'new'}`} module={modal.module} mode={modal.mode} onClose={() => setModal(null)} onSave={saveModule} />}
      </AnimatePresence>
      <AnimatePresence>
        {notice && <MotionDiv className="instructor-toast" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} role="status">{notice}</MotionDiv>}
      </AnimatePresence>
    </div>
  );
};

export default InstructorLMSPage;