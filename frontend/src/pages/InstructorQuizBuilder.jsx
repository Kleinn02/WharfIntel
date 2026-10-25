import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadInstructorModules } from './lmsStore';
import { createAssessmentId, loadQuizzes, saveQuizzes } from './quizStore';
import './InstructorQuizBuilder.css';

const blankQuestion = (index) => ({
  id: createAssessmentId(),
  type: 'multiple-choice',
  prompt: '',
  points: 1,
  options: [`Choice ${index + 1}A`, `Choice ${index + 1}B`],
  answer: `Choice ${index + 1}A`,
});

const blankQuiz = () => ({
  id: createAssessmentId(),
  title: '',
  description: '',
  courseId: '',
  passingScore: 70,
  timeLimit: 30,
  availableFrom: '',
  availableUntil: '',
  maxAttempts: 1,
  status: 'Draft',
  questions: [blankQuestion(0)],
});

const getQuestionDefaults = (type, index) => ({
  ...blankQuestion(index),
  type,
  options: type === 'true-false' ? ['True', 'False'] : type === 'multiple-choice' ? [`Choice ${index + 1}A`, `Choice ${index + 1}B`] : [],
  answer: type === 'true-false' ? 'True' : type === 'multiple-choice' ? `Choice ${index + 1}A` : '',
});

const InstructorQuizBuilder = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quizId');
  const [initialData] = useState(() => {
    try {
      const found = quizId ? loadQuizzes().find((quiz) => quiz.id === quizId) : null;
      return {
        modules: loadInstructorModules().filter((module) => module.status !== 'Deleted'),
        form: found ? { ...blankQuiz(), ...found, questions: found.questions.map((question) => ({ ...question })) } : blankQuiz(),
        error: quizId && !found ? 'This quiz could not be found. It may have been removed in another tab.' : '',
      };
    } catch (loadError) {
      return { modules: [], form: blankQuiz(), error: loadError.message || 'Could not load saved assessment data.' };
    }
  });
  const [form, setForm] = useState(initialData.form);
  const [modules] = useState(initialData.modules);
  const [error, setError] = useState(initialData.error);
  const [savedMessage, setSavedMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const role = (localStorage.getItem('role') || '').toLowerCase();
  const authorized = role === 'admin' || role === 'instructor';

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const updateQuestion = (questionId, updates) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? { ...question, ...updates } : question),
    }));
  };

  const updateQuestionType = (questionId, type) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, index) => (
        question.id === questionId ? { ...getQuestionDefaults(type, index), id: question.id, prompt: question.prompt, points: question.points } : question
      )),
    }));
  };

  const saveAssessment = (event, status) => {
    event.preventDefault();
    setError('');
    setSavedMessage('');
    if (!form.title.trim()) {
      setError('Enter a title for this assessment.');
      return;
    }
    if (status === 'Published' && (!form.questions.length || form.questions.some((question) => !question.prompt.trim() || !question.answer.trim() || Number(question.points) < 1))) {
      setError('Each question needs a prompt, a correct answer, and at least one point.');
      return;
    }
    if (status === 'Published' && form.questions.some((question) => question.type === 'multiple-choice' && (question.options.filter((option) => option.trim()).length < 2 || !question.options.includes(question.answer)))) {
      setError('Multiple-choice questions need at least two choices and one selected correct answer.');
      return;
    }
    if (Number(form.passingScore) < 0 || Number(form.passingScore) > 100
      || Number(form.timeLimit) < 1 || Number(form.timeLimit) > 600
      || Number(form.maxAttempts) < 1 || Number(form.maxAttempts) > 99) {
      setError('Passing score, time limit, or maximum attempts is outside the allowed range.');
      return;
    }
    if (form.availableFrom && form.availableUntil && new Date(form.availableUntil) < new Date(form.availableFrom)) {
      setError('The availability end must be after the start.');
      return;
    }

    setIsSaving(true);
    try {
      const quizzes = loadQuizzes();
      const updated = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        passingScore: Number(form.passingScore),
        timeLimit: Number(form.timeLimit),
        maxAttempts: Number(form.maxAttempts),
        questions: form.questions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          points: Number(question.points),
          options: question.type === 'multiple-choice' ? question.options.map((option) => option.trim()) : question.options,
          answer: question.answer.trim(),
        })),
        status,
        updatedAt: new Date().toISOString(),
      };
      const nextQuizzes = quizzes.some((quiz) => quiz.id === updated.id)
        ? quizzes.map((quiz) => quiz.id === updated.id ? updated : quiz)
        : [updated, ...quizzes];
      saveQuizzes(nextQuizzes);
      setForm(updated);
      setSavedMessage(status === 'Published' ? 'Assessment published for learners.' : 'Draft saved.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save this assessment in browser storage.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!authorized) {
    return (
      <main className="quiz-builder-page">
        <section className="quiz-builder-card"><p className="quiz-eyebrow">RESTRICTED WORKSPACE</p><h1>Instructor access required</h1><button type="button" className="quiz-button primary" onClick={() => navigate('/lms')}>Back to LMS</button></section>
      </main>
    );
  }

  return (
    <main className="quiz-builder-page">
      <header className="quiz-builder-topbar">
        <button type="button" className="quiz-button quiet" onClick={() => navigate('/lms/instructor')}>← Instructor dashboard</button>
        <span className="quiz-saved-indicator">ASSESSMENT WORKSPACE</span>
      </header>
      <div className="quiz-builder-content">
        <div className="quiz-page-heading"><p className="quiz-eyebrow">LEARNING OPERATIONS / ASSESSMENT CONTROL</p><h1>{quizId ? 'Edit assessment' : 'Create assessment'}</h1><p>Configure questions, availability, timing, and learner attempts.</p></div>
        <form className="quiz-builder-form" onSubmit={(event) => saveAssessment(event, 'Published')}>
          <section className="quiz-builder-card">
            <div className="quiz-card-heading"><div><p className="quiz-eyebrow">ASSESSMENT DETAILS</p><h2>Quiz / exam settings</h2></div><span className={`quiz-status-chip status-${form.status.toLowerCase()}`}>{form.status}</span></div>
            <div className="quiz-field-grid">
              <label className="quiz-field full"><span>Quiz title <i>*</i></span><input name="title" value={form.title} onChange={updateField} maxLength={140} required placeholder="e.g. Port safety certification exam" /></label>
              <label className="quiz-field full"><span>Description</span><textarea name="description" value={form.description} onChange={updateField} rows={3} maxLength={1000} placeholder="Describe the assessment and what it covers." /></label>
              <label className="quiz-field"><span>Course assignment</span><select name="courseId" value={form.courseId} onChange={updateField}><option value="">General assessment</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
              <label className="quiz-field"><span>Passing score (%)</span><input name="passingScore" type="number" min="0" max="100" value={form.passingScore} onChange={updateField} required /></label>
              <label className="quiz-field"><span>Time limit (minutes)</span><input name="timeLimit" type="number" min="1" max="600" value={form.timeLimit} onChange={updateField} required /></label>
              <label className="quiz-field"><span>Maximum attempts</span><input name="maxAttempts" type="number" min="1" max="99" value={form.maxAttempts} onChange={updateField} required /></label>
              <label className="quiz-field"><span>Availability starts</span><input name="availableFrom" type="datetime-local" value={form.availableFrom} onChange={updateField} /></label>
              <label className="quiz-field"><span>Availability ends</span><input name="availableUntil" type="datetime-local" value={form.availableUntil} onChange={updateField} /></label>
            </div>
          </section>

          <section className="quiz-builder-card">
            <div className="quiz-card-heading"><div><p className="quiz-eyebrow">QUESTION DESIGN</p><h2>Questions <span className="quiz-question-count">{form.questions.length}</span></h2></div><button type="button" className="quiz-button secondary" onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, blankQuestion(current.questions.length)] }))}>＋ Add question</button></div>
            <div className="quiz-question-list">
              {form.questions.map((question, index) => (
                <fieldset className="quiz-question-card" key={question.id}>
                  <legend>QUESTION {String(index + 1).padStart(2, '0')}</legend>
                  <div className="quiz-question-controls">
                    <label className="quiz-field"><span>Question type</span><select value={question.type} onChange={(event) => updateQuestionType(question.id, event.target.value)}><option value="multiple-choice">Multiple choice</option><option value="true-false">True / False</option><option value="identification">Identification</option><option value="short-answer">Short answer</option><option value="essay">Essay</option></select></label>
                    <label className="quiz-field quiz-points-field"><span>Points</span><input type="number" min="1" max="100" value={question.points} onChange={(event) => updateQuestion(question.id, { points: event.target.value })} required /></label>
                  </div>
                  <label className="quiz-field"><span>Question prompt <i>*</i></span><textarea value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} rows={2} maxLength={1000} required placeholder="Write a clear question for learners" /></label>
                  {question.type === 'multiple-choice' && (
                    <div className="quiz-options">
                      <span className="quiz-option-title">Answer choices <small>Select the correct answer.</small></span>
                      {question.options.map((option, optionIndex) => (
                        <div className="quiz-option-row" key={`${question.id}-${optionIndex}`}>
                          <input type="radio" name={`correct-${question.id}`} checked={question.answer === option} onChange={() => updateQuestion(question.id, { answer: option })} aria-label={`Mark choice ${optionIndex + 1} as correct`} />
                          <input value={option} onChange={(event) => {
                            const options = question.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item);
                            updateQuestion(question.id, { options, answer: question.answer === option ? event.target.value : question.answer });
                          }} placeholder={`Choice ${optionIndex + 1}`} required />
                          <button type="button" onClick={() => {
                            const options = question.options.filter((_, itemIndex) => itemIndex !== optionIndex);
                            updateQuestion(question.id, { options, answer: question.answer === option ? (options[0] || '') : question.answer });
                          }} disabled={question.options.length <= 2} aria-label={`Remove choice ${optionIndex + 1}`}>×</button>
                        </div>
                      ))}
                      <div className="quiz-option-actions">
                        <button type="button" className="quiz-add-option" onClick={() => updateQuestion(question.id, { options: [...question.options, ''] })}>＋ Add choice</button>
                        <button type="button" className="quiz-remove-question" onClick={() => setForm((current) => ({ ...current, questions: current.questions.length > 1 ? current.questions.filter((item) => item.id !== question.id) : current.questions }))} disabled={form.questions.length <= 1}>Remove question</button>
                      </div>
                    </div>
                  )}
                  {question.type === 'true-false' && <label className="quiz-field"><span>Correct answer</span><select value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}><option value="True">True</option><option value="False">False</option></select></label>}
                  {['identification', 'short-answer', 'essay'].includes(question.type) && (
                    <label className="quiz-field">
                      <span>{question.type === 'essay' ? 'Grading rubric / reference key' : 'Expected answer / reference key'} <i>*</i></span>
                      <textarea value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })} maxLength={1000} rows={question.type === 'essay' ? 3 : 2} required placeholder={question.type === 'essay' ? 'Describe the criteria for awarding points.' : 'Enter the expected answer or grading guide.'} />
                    </label>
                  )}
                </fieldset>
              ))}
            </div>
          </section>

          {error && <p className="quiz-form-message error" role="alert">{error}</p>}
          {savedMessage && <p className="quiz-form-message success" role="status">{savedMessage}</p>}
          <footer className="quiz-builder-actions">
            <span>Changes are stored in this browser and shared across its tabs.</span>
            <button type="button" className="quiz-button secondary" disabled={isSaving} onClick={(event) => saveAssessment(event, 'Draft')}>Save draft</button>
            <button type="submit" className="quiz-button primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save & publish'}</button>
          </footer>
        </form>
      </div>
    </main>
  );
};

export default InstructorQuizBuilder;