import { useEffect, useMemo, useState } from 'react';
import { loadLearnerProgress, LEARNER_PROGRESS_PREFIX } from './lmsStore';
import { isAwaitingInstructorReview, loadQuizAttempts, saveQuizAttempts, scoreAssessment } from './quizStore';
import './InstructorManagementViews.css';

const MANUAL_QUESTION_TYPES = ['identification', 'short-answer', 'essay'];
const isManualQuestion = (question) => MANUAL_QUESTION_TYPES.includes(question.type);

const formatSubmittedAt = (value) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const getAttempts = () => Object.entries(loadQuizAttempts()).flatMap(([studentName, attempts]) => (
  Array.isArray(attempts) ? attempts.map((attempt) => ({ ...attempt, studentName })) : []
));

const GradingWorkspace = ({ submission, quiz, onClose, onFinalize }) => {
  const manualQuestions = quiz.questions.filter(isManualQuestion);
  const [grades, setGrades] = useState(() => Object.fromEntries(manualQuestions.map((question) => [
    question.id,
    submission.manualGrades?.[question.id] || { points: '', feedback: '' },
  ])));
  const [error, setError] = useState('');
  const autoScore = scoreAssessment(quiz, submission.answers || {});

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const updateGrade = (questionId, field, value) => {
    setGrades((current) => ({
      ...current,
      [questionId]: { ...current[questionId], [field]: value },
    }));
    setError('');
  };

  const finalize = (event) => {
    event.preventDefault();
    const invalidGrade = manualQuestions.find((question) => {
      const value = grades[question.id]?.points;
      return value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > Number(question.points);
    });
    if (invalidGrade) {
      setError(`Enter a mark from 0 to ${invalidGrade.points} for every subjective question.`);
      return;
    }
    try {
      onFinalize(submission, quiz, grades);
    } catch (saveError) {
      setError(saveError.message || 'The final grade could not be saved.');
    }
  };

  return (
    <div className="instructor-modal-backdrop grading-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="instructor-modal grading-workspace" role="dialog" aria-modal="true" aria-labelledby="grading-workspace-title">
        <header className="instructor-modal-header">
          <div>
            <p className="instructor-eyebrow">SUBMISSION CHECKING / FINAL GRADE</p>
            <h2 id="grading-workspace-title">{quiz.title}</h2>
            <p className="grading-student-meta">{submission.studentName} · Submitted {formatSubmittedAt(submission.submittedAt)}</p>
          </div>
          <button className="instructor-icon-button" type="button" onClick={onClose} aria-label="Close grading workspace">×</button>
        </header>
        <form onSubmit={finalize}>
          <div className="grading-auto-summary">
            <span>Auto-graded points</span>
            <strong>{autoScore.autoGradedEarnedPoints} / {autoScore.autoGradedPossiblePoints}</strong>
          </div>
          <div className="grading-question-list">
            {quiz.questions.map((question, index) => {
              const answer = submission.answers?.[question.id];
              const subjective = isManualQuestion(question);
              const correct = ['multiple-choice', 'true-false'].includes(question.type)
                && String(answer ?? '').trim().length > 0
                && String(answer ?? '').trim().toLowerCase() === String(question.answer ?? '').trim().toLowerCase();
              return (
                <article className="grading-question-card" key={question.id}>
                  <div className="grading-question-heading">
                    <span>QUESTION {String(index + 1).padStart(2, '0')} · {question.points} POINT{Number(question.points) === 1 ? '' : 'S'}</span>
                    <strong className={subjective ? 'grading-manual-tag' : correct ? 'grading-correct-tag' : 'grading-incorrect-tag'}>
                      {subjective ? 'Manual review' : correct ? 'Correct' : 'Incorrect'}
                    </strong>
                  </div>
                  <h3>{question.prompt}</h3>
                  <div className="grading-answer-grid">
                    <div><span>Student answer</span><p>{String(answer ?? '').trim() || 'No response'}</p></div>
                    <div><span>{subjective ? 'Rubric / reference key' : 'Correct answer'}</span><p>{question.answer || 'No key provided'}</p></div>
                  </div>
                  {subjective && (
                    <div className="grading-input-grid">
                      <label className="instructor-field">
                        <span>Manual points <i>*</i></span>
                        <input type="number" min="0" max={question.points} step="0.01" required value={grades[question.id]?.points ?? ''} onChange={(event) => updateGrade(question.id, 'points', event.target.value)} />
                      </label>
                      <label className="instructor-field grading-feedback-field">
                        <span>Written feedback</span>
                        <textarea rows={2} maxLength={2000} value={grades[question.id]?.feedback ?? ''} onChange={(event) => updateGrade(question.id, 'feedback', event.target.value)} placeholder="Feedback for the student (optional)" />
                      </label>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {error && <p className="instructor-form-error" role="alert">{error}</p>}
          <footer className="instructor-modal-footer grading-footer">
            <button className="instructor-button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="instructor-button primary" type="submit">Finalize Grade &amp; Release Score</button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export const SubmissionChecking = ({ modules, quizzes, onNotice }) => {
  const [, setRefreshRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const snapshot = (() => {
    try {
      return { attempts: getAttempts(), error: '' };
    } catch (loadError) {
      return { attempts: [], error: loadError.message || 'Could not load submitted assessment attempts.' };
    }
  })();
  const quizById = useMemo(() => new Map(quizzes.map((quiz) => [quiz.id, quiz])), [quizzes]);
  const moduleById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const awaitingReview = snapshot.attempts.filter(isAwaitingInstructorReview);
  const pending = awaitingReview.filter((attempt) => quizById.has(attempt.quizId));
  const finalizeGrade = (submission, quiz, manualGrades) => {
    const current = loadQuizAttempts();
    const currentStudentAttempts = current[submission.studentName] || [];
    const currentAttempt = currentStudentAttempts.find((attempt) => attempt.id === submission.id);
    if (!currentAttempt || !isAwaitingInstructorReview(currentAttempt)) {
      throw new Error('This submission is no longer awaiting review. Refresh the list and try again.');
    }
    const auto = scoreAssessment(quiz, currentAttempt.answers || {});
    const normalizedGrades = Object.fromEntries(Object.entries(manualGrades).map(([questionId, grade]) => [
      questionId,
      { ...grade, points: Number(grade.points) },
    ]));
    const manualEarned = quiz.questions.filter(isManualQuestion).reduce(
      (total, question) => total + normalizedGrades[question.id].points,
      0,
    );
    const earnedPoints = auto.autoGradedEarnedPoints + manualEarned;
    const percentage = auto.possiblePoints ? Math.round((earnedPoints / auto.possiblePoints) * 100) : 0;
    const releasedAttempt = {
      ...currentAttempt,
      status: 'Graded',
      manualGrades: normalizedGrades,
      autoGradedEarnedPoints: auto.autoGradedEarnedPoints,
      autoGradedPossiblePoints: auto.autoGradedPossiblePoints,
      earnedPoints,
      possiblePoints: auto.possiblePoints,
      percentage,
      passed: percentage >= Number(quiz.passingScore),
      gradedAt: new Date().toISOString(),
      gradedBy: localStorage.getItem('username') || 'Instructor',
    };
    saveQuizAttempts({
      ...current,
      [submission.studentName]: currentStudentAttempts.map((attempt) => (
        attempt.id === submission.id ? releasedAttempt : attempt
      )),
    });

    let progressNotice = '';
    if (quiz.courseId) {
      try {
        const progressKey = `${LEARNER_PROGRESS_PREFIX}${submission.studentName}`;
        const savedProgress = JSON.parse(localStorage.getItem(progressKey) || '{}');
        const courseScores = { ...(savedProgress.__assessmentScores?.[quiz.courseId] || {}), [quiz.id]: percentage };
        localStorage.setItem(progressKey, JSON.stringify({
          ...savedProgress,
          __assessmentScores: { ...(savedProgress.__assessmentScores || {}), [quiz.courseId]: courseScores },
          __lastActivity: releasedAttempt.gradedAt,
        }));
      } catch (progressError) {
        progressNotice = ` Course progress could not be refreshed: ${progressError.message || 'browser storage is unavailable'}.`;
      }
    }
    setRefreshRevision((revision) => revision + 1);
    setSelected(null);
    onNotice(`Grade released to ${submission.studentName}.${progressNotice}`);
  };

  return (
    <>
      <section className="instructor-panel instructor-management-panel" aria-labelledby="submission-checking-heading">
        <div className="instructor-section-head">
          <div><p className="instructor-eyebrow">ASSESSMENT CONTROL</p><h2 id="submission-checking-heading">Submission Checking</h2></div>
          <span className="instructor-count">{pending.length} NEED{pending.length === 1 ? 'S' : ''} GRADING</span>
        </div>
        {snapshot.error && <p className="instructor-form-error" role="alert">{snapshot.error}</p>}
        <div className="instructor-table-wrap">
          <table className="instructor-table management-table submission-table">
            <thead><tr><th>Student name</th><th>Course / assessment</th><th>Date submitted</th><th>Auto-graded score</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {pending.map((attempt) => {
                const quiz = quizById.get(attempt.quizId);
                const score = scoreAssessment(quiz, attempt.answers || {});
                return (
                  <tr key={`${attempt.studentName}:${attempt.id}`}>
                    <td><span className="instructor-student-name"><i>{attempt.studentName.slice(0, 1).toUpperCase()}</i>{attempt.studentName}</span></td>
                    <td><div className="instructor-module-name"><strong>{moduleById.get(quiz.courseId)?.title || 'General assessment'}</strong><span>{quiz.title}</span></div></td>
                    <td>{formatSubmittedAt(attempt.submittedAt)}</td>
                    <td>{score.autoGradedEarnedPoints} / {score.autoGradedPossiblePoints}</td>
                    <td><span className="instructor-status status-needs-grading">Needs Grading</span></td>
                    <td><button className="instructor-button secondary" type="button" onClick={() => setSelected({ attempt, quiz })}>Evaluate / Check</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pending.length === 0 && !snapshot.error && (
            <p className="instructor-empty">
              {awaitingReview.length
                ? `${awaitingReview.length} submission${awaitingReview.length === 1 ? '' : 's'} need grading, but the matching assessment could not be found. Check that this browser has the same published quizzes as the learner browser.`
                : 'There are no quiz or exam submissions awaiting manual review. Assessment submissions are stored in this browser, so learners and instructors need to use the same browser profile to share them.'}
            </p>
          )}
        </div>
      </section>
      {selected && <GradingWorkspace submission={selected.attempt} quiz={selected.quiz} onClose={() => setSelected(null)} onFinalize={finalizeGrade} />}
    </>
  );
};

const buildStudentDirectory = (modules, quizzes) => {
  const learners = loadLearnerProgress(modules);
  const attempts = getAttempts();
  const students = new Map();
  learners.forEach((learner) => {
    if (!students.has(learner.studentName)) students.set(learner.studentName, { username: learner.studentName, courses: [], attempts: [] });
    students.get(learner.studentName).courses.push(learner);
  });
  const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  attempts.forEach((attempt) => {
    if (!students.has(attempt.studentName)) students.set(attempt.studentName, { username: attempt.studentName, courses: [], attempts: [] });
    students.get(attempt.studentName).attempts.push({ ...attempt, quizTitle: quizById.get(attempt.quizId)?.title || attempt.quizId });
  });
  return [...students.values()].map((student) => {
    const gradedAttempts = student.attempts.filter((attempt) => (
      ['Graded', 'Submitted'].includes(attempt.status) && Number.isFinite(Number(attempt.percentage))
    ));
    const scores = gradedAttempts.map((attempt) => Number(attempt.percentage));
    const overallProgress = student.courses.length
      ? Math.round(student.courses.reduce((total, course) => total + course.progress, 0) / student.courses.length)
      : 0;
    return {
      ...student,
      averageAssessmentScore: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null,
      overallProgress,
      accountStatus: 'Active',
    };
  }).sort((left, right) => left.username.localeCompare(right.username));
};

const StudentActionModal = ({ student, mode, modules, onClose, onSaveEnrollment, onIssueCertificate }) => {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const [enrolled, setEnrolled] = useState(() => new Set(student.courses.map((course) => course.courseId)));
  const [message, setMessage] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(student.courses[0]?.courseId || modules[0]?.id || '');
  const [error, setError] = useState('');

  const saveEnrollment = () => {
    try {
      onSaveEnrollment(student, [...enrolled]);
      onClose();
    } catch (saveError) {
      setError(saveError.message || 'Enrolment changes could not be saved.');
    }
  };

  const issueCertificate = () => {
    try {
      if (!selectedCourse) throw new Error('Select a course before issuing a certificate.');
      onIssueCertificate(student, selectedCourse);
      setMessage(`Certificate issued for ${moduleById.get(selectedCourse)?.title || selectedCourse}.`);
    } catch (saveError) {
      setError(saveError.message || 'The certificate could not be issued.');
    }
  };

  return (
    <div className="instructor-modal-backdrop grading-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="instructor-modal student-action-modal" role="dialog" aria-modal="true" aria-labelledby="student-action-title">
        <header className="instructor-modal-header">
          <div><p className="instructor-eyebrow">STUDENT MANAGEMENT</p><h2 id="student-action-title">{student.username}</h2></div>
          <button className="instructor-icon-button" type="button" onClick={onClose} aria-label="Close student details">×</button>
        </header>
        {mode === 'history' && (
          <div className="student-history-content">
            <h3>Course progress</h3>
            {student.courses.length ? student.courses.map((course) => <div className="student-history-row" key={course.courseId}><span>{course.courseName}</span><strong>{course.progress}%</strong></div>) : <p className="instructor-empty">No course activity is recorded.</p>}
            <h3>Assessment history</h3>
            {student.attempts.length ? student.attempts.slice().sort((left, right) => new Date(right.submittedAt || 0) - new Date(left.submittedAt || 0)).map((attempt) => (
              <div className="student-history-row" key={attempt.id}>
                <span>{attempt.quizTitle || attempt.quizId} · {attempt.status} · {formatSubmittedAt(attempt.submittedAt)}</span>
                <strong>{attempt.status === 'Graded' ? `${attempt.percentage}%` : attempt.status === 'Pending Review' ? 'Pending' : '—'}</strong>
              </div>
            )) : <p className="instructor-empty">No assessment attempts are recorded.</p>}
          </div>
        )}
        {mode === 'courses' && (
          <div className="student-enrollment-content">
            <p>Select the courses assigned to this learner.</p>
            <div className="student-enrollment-list">
              {modules.filter((module) => module.status !== 'Deleted').map((module) => (
                <label key={module.id}><input type="checkbox" checked={enrolled.has(module.id)} onChange={(event) => setEnrolled((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(module.id);
                  else next.delete(module.id);
                  return next;
                })} /><span>{module.title}<small>{module.targetAudience || module.category}</small></span></label>
              ))}
            </div>
            {error && <p className="instructor-form-error" role="alert">{error}</p>}
            <footer className="instructor-modal-footer"><button className="instructor-button secondary" type="button" onClick={onClose}>Cancel</button><button className="instructor-button primary" type="button" onClick={saveEnrollment}>Save Enrolment</button></footer>
          </div>
        )}
        {mode === 'certificate' && (
          <div className="student-certificate-content">
            <p>Choose the course for the certificate record. This action is saved in this browser.</p>
            <label className="instructor-field"><span>Course</span><select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>{modules.filter((module) => module.status !== 'Deleted').map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label>
            {error && <p className="instructor-form-error" role="alert">{error}</p>}
            {message && <p className="instructor-form-success" role="status">{message}</p>}
            <footer className="instructor-modal-footer"><button className="instructor-button secondary" type="button" onClick={onClose}>Close</button><button className="instructor-button primary" type="button" onClick={issueCertificate}>Issue Certificate</button></footer>
          </div>
        )}
      </section>
    </div>
  );
};

export const StudentManagement = ({ modules, quizzes, onNotice }) => {
  const [, setRefreshRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState('All batches');
  const [selected, setSelected] = useState(null);
  const snapshot = (() => {
    try {
      return { students: buildStudentDirectory(modules, quizzes), error: '' };
    } catch (loadError) {
      return { students: [], error: loadError.message || 'Could not load student records.' };
    }
  })();
  const students = snapshot.students;
  const batches = [...new Set(modules.map((module) => module.targetAudience).filter(Boolean))].sort();

  const filteredStudents = students.filter((student) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${student.username} ${student.username}`.toLowerCase().includes(query);
    const matchesBatch = batch === 'All batches' || student.courses.some((course) => (
      modules.find((module) => module.id === course.courseId)?.targetAudience === batch
    ));
    return matchesSearch && matchesBatch;
  });

  const saveEnrollment = (student, courseIds) => {
    const progressKey = `${LEARNER_PROGRESS_PREFIX}${student.username}`;
    const saved = JSON.parse(localStorage.getItem(progressKey) || '{}');
    const moduleById = new Map(modules.map((module) => [module.id, module]));
    courseIds.forEach((courseId) => {
      if (!saved[courseId]) saved[courseId] = Object.fromEntries((moduleById.get(courseId)?.sections || []).map((section) => [section.id, false]));
    });
    saved.__enrolledCourses = courseIds;
    localStorage.setItem(progressKey, JSON.stringify(saved));
    setRefreshRevision((revision) => revision + 1);
    onNotice(`Course enrolment updated for ${student.username}.`);
  };

  const issueCertificate = (student, courseId) => {
    const storageKey = 'wharfintel:lms-certificates:v1';
    const certificates = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(certificates)) throw new Error('Saved certificate records are invalid.');
    const module = modules.find((item) => item.id === courseId);
    const certificate = {
      id: globalThis.crypto?.randomUUID?.() || `certificate-${Date.now()}`,
      studentId: student.username,
      courseId,
      courseTitle: module?.title || courseId,
      issuedAt: new Date().toISOString(),
      issuedBy: localStorage.getItem('username') || 'Instructor',
    };
    localStorage.setItem(storageKey, JSON.stringify([...certificates, certificate]));
    onNotice(`Certificate issued for ${student.username}.`);
  };

  return (
    <>
      <section className="instructor-panel instructor-management-panel" aria-labelledby="student-management-heading">
        <div className="instructor-section-head">
          <div><p className="instructor-eyebrow">LEARNER DIRECTORY</p><h2 id="student-management-heading">Student Management</h2></div>
          <span className="instructor-count">{students.length} STUDENT{students.length === 1 ? '' : 'S'}</span>
        </div>
        <div className="student-directory-toolbar">
          <label className="instructor-search"><span className="sr-only">Search students</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or ID" /></label>
          <label className="student-batch-filter"><span className="sr-only">Filter by course batch</span><select value={batch} onChange={(event) => setBatch(event.target.value)}><option>All batches</option>{batches.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        {snapshot.error && <p className="instructor-form-error" role="alert">{snapshot.error}</p>}
        <div className="instructor-table-wrap">
          <table className="instructor-table management-table student-directory-table">
            <thead><tr><th>Student name</th><th>ID / Email</th><th>Enrolled courses</th><th>Overall progress</th><th>Avg. assessment score</th><th>Account status</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.username}>
                  <td><span className="instructor-student-name"><i>{student.username.slice(0, 1).toUpperCase()}</i>{student.username}</span></td>
                  <td>{student.username}</td>
                  <td>{student.courses.length}</td>
                  <td><div className="instructor-completion student-completion"><span><i style={{ width: `${student.overallProgress}%` }} /></span><strong>{student.overallProgress}%</strong></div></td>
                  <td>{student.averageAssessmentScore === null ? '—' : `${student.averageAssessmentScore}%`}</td>
                  <td><span className="instructor-status status-active">Active</span></td>
                  <td><div className="student-directory-actions">
                    <button className="instructor-button secondary" type="button" onClick={() => setSelected({ student, mode: 'history' })}>View Performance History</button>
                    <button className="instructor-button secondary" type="button" onClick={() => setSelected({ student, mode: 'courses' })}>Manage Enrolled Courses</button>
                    <button className="instructor-button secondary" type="button" onClick={() => setSelected({ student, mode: 'certificate' })}>Issue Certificate</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && !snapshot.error && <p className="instructor-empty">{students.length ? 'No students match these search and batch filters.' : 'Student records will appear when learners are enrolled or submit assessments.'}</p>}
        </div>
      </section>
      {selected && <StudentActionModal student={selected.student} mode={selected.mode} modules={modules} onClose={() => setSelected(null)} onSaveEnrollment={saveEnrollment} onIssueCertificate={issueCertificate} />}
    </>
  );
};