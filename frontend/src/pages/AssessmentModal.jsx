// src/pages/AssessmentModal.jsx
import React, { useState, useEffect } from 'react';
import { QUESTION_POOLS } from './questionBank';

const AssessmentModal = ({ mode, cargo, initialHealth, onComplete }) => {
  const config = QUESTION_POOLS[mode];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [health, setHealth] = useState(initialHealth);
  const [timeLeft, setTimeLeft] = useState(15); 
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (feedback) return; 
    if (timeLeft <= 0) {
      handleAnswer(null, true); 
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, feedback]);

  const handleAnswer = (selectedIndex, isTimeout = false) => {
    const q = config.questions[currentIndex];
    const isCorrect = !isTimeout && selectedIndex === q.ans;

    if (isCorrect) {
      advanceQuestion(health);
    } else {
      const newHealth = Math.max(0, health - config.penalty);
      setHealth(newHealth);
      
      setFeedback({
        type: 'error',
        msg: isTimeout ? "TIMED OUT. Decisiveness is required at sea." : `INCORRECT: ${q.reason}`
      });

      setTimeout(() => {
        setFeedback(null);
        advanceQuestion(newHealth);
      }, 3500);
    }
  };

  const advanceQuestion = (currentHealth) => {
    // 💀 INSTANT FAIL: If health hits 0 during the quiz, they immediately die
    if (currentHealth <= 0) {
      onComplete({ success: false, finalHealth: 0, reason: "Vessel Sustained Catastrophic Damage" });
      return;
    }

    if (currentIndex + 1 < config.total) {
      setCurrentIndex(prev => prev + 1);
      setTimeLeft(15); 
    } else {
      // 🏆 SURVIVAL: If they made it to the end with health > 0, the maneuver succeeds!
      onComplete({ 
        success: true, 
        finalHealth: currentHealth,
        reason: "Maneuver Successful"
      });
    }
  };

  const q = config.questions[currentIndex];

  return (
    <div className="modal-overlay" style={{ zIndex: 11000 }}>
      <div className="chaos-modal assessment-modal" style={{ 
          borderTopColor: feedback ? '#e74c3c' : '#3498db',
          boxShadow: feedback ? '0 0 40px rgba(231, 76, 60, 0.4)' : '0 20px 50px rgba(0,0,0,0.5)',
          transition: 'all 0.3s ease'
      }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px', color: '#aaa', textTransform: 'uppercase' }}>
          <span>Cargo Integrity</span>
          <span style={{ color: health <= 20 ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{health}%</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#333', borderRadius: '4px', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ 
            width: `${health}%`, 
            height: '100%', 
            background: health <= 20 ? '#e74c3c' : '#2ecc71', 
            transition: 'width 0.5s ease-out' 
          }}></div>
        </div>

        <h2 style={{ color: '#fff', fontSize: '18px', margin: '0 0 10px 0', textTransform: 'uppercase' }}>
          TACTICAL ASSESSMENT: {mode}
        </h2>
        
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '20px' }}>
          Question {currentIndex + 1} of {config.total} • Target: {cargo}
        </p>

        {feedback ? (
          <div style={{ background: 'rgba(231, 76, 60, 0.15)', border: '1px solid #e74c3c', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ color: '#e74c3c', margin: '0 0 10px 0' }}>CRITICAL ERROR</h3>
            <p style={{ color: '#fff', fontSize: '14px', margin: 0 }}>{feedback.msg}</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '16px', color: '#fff', marginBottom: '20px', minHeight: '60px' }}>
              {q.q}
            </div>
            
            <div style={{ background: 'rgba(52, 152, 219, 0.1)', padding: '5px 15px', borderRadius: '20px', display: 'inline-block', marginBottom: '20px' }}>
              <span style={{ color: timeLeft <= 5 ? '#e74c3c' : '#3498db', fontWeight: 'bold' }}>
                ⏱ T-MINUS: {timeLeft}s
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {q.options.map((opt, i) => (
                <button 
                  key={i}
                  className="btn-push neutral-btn"
                  style={{ width: '100%', padding: '12px', fontSize: '13px' }}
                  onClick={() => handleAnswer(i)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssessmentModal;